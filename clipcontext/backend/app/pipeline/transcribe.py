"""Stage 2: word-level transcript.

Providers:
  * groq  - hosted Whisper (free tier); audio is split at quiet points into chunks
  * local - faster-whisper on CPU (int8)
  * fake  - synthetic words for tests

Output (transcript.json):
  {"language", "provider", "model", "words": [{"w","s","e"}], "lines": [{"id","s","e","text","w0","w1"}]}

Hinglish mode asks Whisper for romanized output and transliterates any remaining
Devanagari words to Latin script, so subtitles and metadata are in Latin script.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any

import httpx
import numpy as np

from app.core.config import get_settings
from app.pipeline.media import encode_audio_chunk, rms_envelope

log = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
HINGLISH_PROMPT = (
    "Yeh video Hinglish mein hai. Hum Hindi aur English dono bolte hain, "
    "aur sab kuch Roman script mein likha hai. Toh chaliye shuru karte hain."
)
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")


# ------------------------------------------------------------------ public API
def transcribe(wav: Path, duration_s: float, language_mode: str, work_dir: Path) -> dict[str, Any]:
    settings = get_settings()
    provider = settings.transcription_provider
    if provider == "auto":
        provider = "groq" if settings.groq_api_key else "local"
    if provider == "fake":
        words, language, model = _fake_words(duration_s), "en", "fake"
    elif provider == "groq":
        words, language, model = _groq_transcribe(wav, duration_s, language_mode, work_dir)
    else:
        words, language, model = _local_transcribe(wav, language_mode)

    if language_mode == "hinglish":
        words = [{**w, "w": romanize(w["w"])} for w in words]
    words = [w for w in words if w["w"].strip()]
    return {
        "language": language,
        "language_mode": language_mode,
        "provider": provider,
        "model": model,
        "words": words,
        "lines": build_lines(words),
    }


# --------------------------------------------------------------- line building
def build_lines(words: list[dict], max_line_s: float = 12.0, max_words: int = 32,
                pause_s: float = 0.8, min_sentence_s: float = 2.5) -> list[dict]:
    """Group words into short, sentence-like lines. Lines are the unit the LLM picks from."""
    lines: list[dict] = []
    start_idx = 0
    for i, word in enumerate(words):
        is_last = i == len(words) - 1
        first = words[start_idx]
        span = word["e"] - first["s"]
        gap = (words[i + 1]["s"] - word["e"]) if not is_last else 0.0
        sentence_end = bool(re.search(r"[.!?…]['\")\]]?$", word["w"].strip()))
        if (is_last or gap >= pause_s or (sentence_end and span >= min_sentence_s)
                or span >= max_line_s or (i - start_idx + 1) >= max_words):
            chunk = words[start_idx:i + 1]
            lines.append({
                "id": f"L{len(lines) + 1}",
                "s": round(chunk[0]["s"], 3),
                "e": round(chunk[-1]["e"], 3),
                "text": join_words(chunk),
                "w0": start_idx,
                "w1": i,
            })
            start_idx = i + 1
    return lines


def join_words(words: list[dict]) -> str:
    text = " ".join(w["w"].strip() for w in words)
    return re.sub(r"\s+([,.!?;:…])", r"\1", text).strip()


# ----------------------------------------------------------------- romanizing
def romanize(token: str) -> str:
    """Transliterate Devanagari to a readable Latin spelling (Hinglish style)."""
    if not _DEVANAGARI.search(token):
        return token
    from indic_transliteration import sanscript
    from indic_transliteration.sanscript import transliterate

    latin = transliterate(token, sanscript.DEVANAGARI, sanscript.ITRANS)
    latin = latin.replace("~N", "n").replace(".N", "n").replace(".n", "n").replace("M", "n")
    latin = latin.replace("RRi", "ri").replace("R^i", "ri").replace(".h", "").replace("H", "h")
    latin = re.sub(r"[\^~._`]", "", latin)
    latin = latin.lower()
    latin = re.sub(r"aa(?=\b)", "a", latin)  # final long a reads better short in Hinglish
    latin = latin.replace("ii", "i").replace("uu", "u").replace("ee", "i")
    return latin


# -------------------------------------------------------------------- chunking
def plan_chunks(wav: Path, duration_s: float, chunk_s: int, search_s: float = 20.0) -> list[tuple[float, float]]:
    """Split audio into ~chunk_s pieces, cutting at the quietest point near each boundary."""
    if duration_s <= chunk_s * 1.1:
        return [(0.0, duration_s)]
    envelope, step = rms_envelope(wav, 0.1)
    cuts = [0.0]
    target = float(chunk_s)
    while target < duration_s - chunk_s * 0.25:
        lo = int(max(cuts[-1] + 30, target - search_s) / step)
        hi = int(min(duration_s - 5, target + search_s) / step)
        if hi > lo and hi <= len(envelope):
            cut = (lo + int(np.argmin(envelope[lo:hi]))) * step
        else:
            cut = target
        cuts.append(round(cut, 2))
        target = cut + chunk_s
    cuts.append(duration_s)
    return list(zip(cuts[:-1], cuts[1:]))


# --------------------------------------------------------------------- groq
def _groq_transcribe(wav: Path, duration_s: float, language_mode: str, work_dir: Path):
    settings = get_settings()
    model = settings.groq_whisper_model_hinglish if language_mode == "hinglish" else settings.groq_whisper_model
    chunks = plan_chunks(wav, duration_s, settings.audio_chunk_seconds)
    chunk_dir = work_dir / "asr_chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)
    words: list[dict] = []
    language = "en"
    with httpx.Client(timeout=300) as client:
        for index, (start, end) in enumerate(chunks):
            cache = chunk_dir / f"chunk_{index:03d}.json"
            if cache.exists():
                payload = json.loads(cache.read_text())
            else:
                audio = chunk_dir / f"chunk_{index:03d}.mp3"
                encode_audio_chunk(wav, start, end, audio)
                payload = _groq_request(client, audio, model, language_mode)
                cache.write_text(json.dumps(payload))
                audio.unlink(missing_ok=True)
            language = payload.get("language") or language
            for w in payload.get("words") or []:
                words.append({"w": str(w.get("word", "")), "s": round(start + float(w["start"]), 3),
                              "e": round(start + float(w["end"]), 3)})
            log.info("groq transcribed chunk %d/%d", index + 1, len(chunks))
    return _dedupe_words(words), language, model


def _groq_request(client: httpx.Client, audio: Path, model: str, language_mode: str) -> dict:
    settings = get_settings()
    data: dict[str, str | list[str]] = {
        "model": model,
        "response_format": "verbose_json",
        "timestamp_granularities[]": ["word", "segment"],
        "temperature": "0",
    }
    if language_mode == "hinglish":
        data["prompt"] = HINGLISH_PROMPT
    else:
        data["language"] = "en"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    for attempt in range(1, 7):
        with audio.open("rb") as handle:
            response = client.post(GROQ_URL, headers=headers, data=data,
                                   files={"file": (audio.name, handle, "audio/mpeg")})
        if response.status_code == 200:
            return response.json()
        if response.status_code in (429, 500, 502, 503, 504) and attempt < 6:
            wait = _retry_after(response) or min(120.0, 10.0 * attempt)
            log.warning("groq ASR %s, waiting %.0fs", response.status_code, wait)
            time.sleep(wait)
            continue
        raise RuntimeError(f"Groq transcription failed: {response.status_code} {response.text[:300]}")
    raise RuntimeError("Groq transcription failed after retries")


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("retry-after")
    try:
        return float(value) if value else None
    except ValueError:
        return None


def _dedupe_words(words: list[dict]) -> list[dict]:
    words.sort(key=lambda w: (w["s"], w["e"]))
    out: list[dict] = []
    for w in words:
        if out and w["s"] < out[-1]["e"] - 0.05 and w["w"].strip().lower() == out[-1]["w"].strip().lower():
            continue
        if w["e"] < w["s"]:
            w["e"] = w["s"]
        out.append(w)
    return out


# -------------------------------------------------------------------- local
_LOCAL_MODEL = None
_LOCAL_LOCK = threading.Lock()


def _local_transcribe(wav: Path, language_mode: str):
    global _LOCAL_MODEL
    from faster_whisper import WhisperModel

    settings = get_settings()
    with _LOCAL_LOCK:
        if _LOCAL_MODEL is None:
            _LOCAL_MODEL = WhisperModel(settings.local_whisper_model, device="cpu", compute_type="int8",
                                        cpu_threads=settings.local_whisper_threads)
    kwargs: dict[str, Any] = {"word_timestamps": True, "vad_filter": True, "beam_size": 1}
    if language_mode == "hinglish":
        kwargs["initial_prompt"] = HINGLISH_PROMPT
    else:
        kwargs["language"] = "en"
    segments, info = _LOCAL_MODEL.transcribe(str(wav), **kwargs)
    words: list[dict] = []
    for segment in segments:
        for w in segment.words or []:
            words.append({"w": w.word, "s": round(w.start, 3), "e": round(w.end, 3)})
    return words, info.language, f"faster-whisper:{settings.local_whisper_model}"


# --------------------------------------------------------------------- fake
_FAKE_SENTENCES = [
    "Here is the one mistake that costs beginners a lot of money.",
    "Most people never notice it until it is too late.",
    "So what should you do instead?",
    "First, write down every number before you decide.",
    "I tried this for thirty days and the results surprised me.",
    "The secret is not working harder, it is working in a different order.",
    "Let me show you exactly how it works with a real example.",
    "That is why three out of four projects fail in the first year.",
]


def _fake_words(duration_s: float) -> list[dict]:
    words: list[dict] = []
    t = 0.5
    k = 0
    while t < duration_s - 1.0:
        sentence = _FAKE_SENTENCES[k % len(_FAKE_SENTENCES)].split()
        for token in sentence:
            if t >= duration_s - 1.0:
                break
            words.append({"w": token, "s": round(t, 3), "e": round(t + 0.32, 3)})
            t += 0.4
        t += 0.9
        k += 1
    return words
