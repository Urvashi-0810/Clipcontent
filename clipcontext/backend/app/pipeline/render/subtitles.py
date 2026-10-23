"""ASS subtitles: word-synced captions with the current word highlighted, plus the hook title."""

from __future__ import annotations

import re

from app.core.config import get_settings

HIGHLIGHT = "&H0000D7FF&"   # ASS colours are &HAABBGGRR -> warm yellow
WHITE = "&H00FFFFFF"


def ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    cs = int(round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def chunk_words(words: list[dict], max_words: int = 3, max_span: float = 1.6, max_chars: int = 22,
                pause: float = 0.45) -> list[list[dict]]:
    """Group words into short caption chunks (2-3 words) that read at a glance."""
    chunks: list[list[dict]] = []
    current: list[dict] = []
    for word in words:
        if current:
            span = word["e"] - current[0]["s"]
            chars = sum(len(w["w"]) + 1 for w in current) + len(word["w"])
            gap = word["s"] - current[-1]["e"]
            ends_sentence = bool(re.search(r"[.!?…]$", current[-1]["w"].strip()))
            if (len(current) >= max_words or span > max_span or chars > max_chars
                    or gap > pause or ends_sentence):
                chunks.append(current)
                current = []
        current.append(word)
    if current:
        chunks.append(current)
    return chunks


def wrap_title(title: str, max_chars: int = 20) -> str:
    words = title.split()
    lines: list[str] = []
    current = ""
    for word in words:
        if current and len(current) + 1 + len(word) > max_chars and len(lines) < 2:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    lines.append(current)
    return "\\N".join(escape(l) for l in lines)


def build_ass(words: list[dict], clip_duration: float, hook_title: str | None) -> str:
    """``words`` must already be relative to the clip start (seconds)."""
    st = get_settings()
    font = st.subtitle_font
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {st.output_width}
PlayResY: {st.output_height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{font},{st.subtitle_font_size},{WHITE},{WHITE},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,70,70,560,1
Style: Hook,{font},{st.hook_font_size},&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,22,0,8,90,90,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    if hook_title:
        end = min(st.hook_title_seconds, clip_duration)
        events.append(f"Dialogue: 1,{ass_time(0)},{ass_time(end)},Hook,,0,0,0,,{{\\fad(120,200)}}{wrap_title(hook_title)}")
    for chunk in chunk_words([w for w in words if w["e"] > 0 and w["s"] < clip_duration]):
        for i, word in enumerate(chunk):
            start = max(0.0, word["s"])
            end = chunk[i + 1]["s"] if i + 1 < len(chunk) else max(word["e"], start + 0.2)
            end = min(end, clip_duration)
            if end <= start:
                continue
            parts = []
            for j, other in enumerate(chunk):
                token = escape(other["w"].strip())
                parts.append(f"{{\\c{HIGHLIGHT}}}{token}{{\\c{WHITE}&}}" if j == i else token)
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{' '.join(parts)}")
    return header + "\n".join(events) + "\n"


def words_for_clip(all_words: list[dict], t_start: float, t_end: float) -> list[dict]:
    return [{"w": w["w"], "s": round(w["s"] - t_start, 3), "e": round(w["e"] - t_start, 3)}
            for w in all_words if w["e"] > t_start and w["s"] < t_end]
