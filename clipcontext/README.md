# ClipContext — Part 1 backend

Turns one long video (30 min – 2.5 h) into 3–10 ranked vertical clips (9:16) with face-tracked
cropping, word-synced captions, a hook title, and evidence-grounded metadata: 10 titles,
10 descriptions and 10 hashtag/tag sets per clip, filtered and ranked by an independent judge
(top 5 shown). Single user, self-hosted, CPU only, free tiers (Gemini + Groq + YouTube Data API key).

Part 1 ends at **download clip + copy metadata**. Publishing, account connection, the performance
loop, B-roll and the editor are Part 2.

## Quick start (Docker)

```bash
cp .env.example .env        # add GOOGLE_API_KEY, GROQ_API_KEY, YOUTUBE_API_KEY
docker compose up -d --build
open http://localhost:8000/docs
```

Add a video:

```bash
# from a URL
curl -X POST localhost:8000/sources -H 'content-type: application/json' \
     -d '{"url": "https://www.youtube.com/watch?v=...", "language_mode": "en"}'

# or upload a file
curl -F file=@talk.mp4 -F language_mode=hinglish localhost:8000/sources/upload
```

Poll `GET /sources/{id}` until `status` is `completed`, then for each clip:
`GET /clips/{clip_id}` (video, scores, evidence, top-5 metadata), `GET /clips/{clip_id}/package`
(copy-ready title/description/hashtags/tags) and `GET /clips/{clip_id}/download`.

## Architecture

```mermaid
flowchart LR
    subgraph M["One machine · Docker Compose"]
        API["api<br/>FastAPI"] --> DB[("db<br/>PostgreSQL: data + job queue")]
        WK["worker<br/>Procrastinate"] -- polls --> DB
        API --> VOL[["media volume"]]
        WK --> VOL
    end
    WK -- HTTPS --> GEM["Gemini (selection, frames, judge)"]
    WK -- HTTPS --> GRQ["Groq (Whisper, generation)"]
    WK -- HTTPS --> YT["YouTube Data API (search, key only)"]
```

Pipeline per long video: `ingest → transcribe → scan → select → niche`, then per clip:
`evidence → render → metadata`. Every stage is checkpointed in `pipeline_runs`; a failed or
cancelled source resumes from the failed stage with `POST /sources/{id}/resume`.

| Stage | What it does | Main code |
|---|---|---|
| ingest | yt-dlp download or upload, ffprobe validation, 16 kHz mono WAV | `app/pipeline/ingest.py` |
| transcribe | Groq Whisper (chunked at quiet points) or local faster-whisper; word timestamps; Hinglish → Latin script | `app/pipeline/transcribe.py` |
| scan | one small frame every 5 s → visual-change signal (whole video, cheap) | `app/pipeline/scan.py` |
| select | text/audio/visual hints + Gemini picks clips on line ids; long videos use 45-min windows + one comparative rerank | `app/pipeline/signals.py`, `select_clips.py` |
| niche | YouTube search of niche queries → outlier score (views/day, views/subs, within-channel z) → style profile | `app/metadata/niche.py`, `style.py` |
| evidence | 1 FPS frames in the clip → quality → pHash dedupe → MMR pick → RapidOCR + Gemini captions → S/O/F facts | `app/pipeline/evidence.py` |
| render | YuNet face tracking → smoothed crop path → ffmpeg crop + scale + ASS captions + hook title | `app/pipeline/render/` |
| metadata | 10 strategies × 3 pools (Groq) → filters (limits, numbers grounded, near-duplicates, anti-copy) → rubric judge ×2 shuffles + pairwise Bradley-Terry (Gemini) | `app/metadata/` |

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/sources` | add by URL (`url`, `language_mode`, optional `channel_handle`) |
| POST | `/sources/upload` | multipart upload (`file`, `language_mode`, `channel_handle`) |
| GET | `/sources` · `/sources/{id}` | list · status, stages, clips, progress |
| POST | `/sources/{id}/resume` · `/cancel` | resume from failed stage · cancel |
| DELETE | `/sources/{id}` | delete source and its files |
| GET | `/clips/{id}` | clip, video/thumbnail URLs, evidence, top-5 metadata |
| GET | `/clips/{id}/metadata?all=true` | every candidate with flags and scores |
| GET | `/clips/{id}/package` | copy-ready title, description, hashtags, tags, category |
| POST | `/clips/{id}/select-title` | choose a title; descriptions/hashtags regenerate to match |
| POST | `/clips/{id}/metadata/regenerate` | rerun one pool |
| GET | `/clips/{id}/download` · `/media/{path}` | file downloads |
| GET | `/system/status` · `/health` | configured keys, models, ffmpeg, face model |

If `API_TOKEN` is set, send `Authorization: Bearer <token>` (or `?token=` for media tags).

## Free-tier notes

- **YouTube search** has its own quota of 100 `search.list` calls/day; ClipContext uses at most
  `NICHE_MAX_SEARCH_CALLS` (default 3) per long video and caches niche profiles for 3 days.
  Benchmark data is cleared after 30 days (YouTube storage rule).
- **LLM calls** fall back along the chains in `.env` when a model is rate-limited, then back off and
  retry. Per clip: 3 generation calls + 6 rubric calls + 6 pairwise calls (set `JUDGE_SHUFFLES=1`
  to save 3). Gemini free-tier prompts may be used by Google for training.
- **Hinglish**: transcription asks Whisper for romanized output and transliterates any Devanagari to
  Latin script; captions and metadata are in Latin script. Quality still needs testing on real videos.

## Local development (without Docker for the app)

Settings are read from a `.env` file in the project root (or in `backend/`), so you do not need to
set environment variables in the shell. Add these two lines to `.env` next to your API keys:

```
DATABASE_URL=postgresql://clipcontext:clipcontext@localhost:5432/clipcontext
MEDIA_DIR=./media
```

You need **Python 3.11 or 3.12**, **ffmpeg** on PATH, and **PostgreSQL 16**. The easiest database is
the one in this compose file: `docker compose up -d db` (it listens on `localhost:5432`).

### Windows (PowerShell)

```powershell
winget install Gyan.FFmpeg          # once; reopen PowerShell so ffmpeg is on PATH
cd backend
uv venv --python 3.12
.venv\Scripts\Activate.ps1
uv pip install -e ".[dev]"

# terminal 1: job worker
python -m app.worker
# terminal 2: API on http://127.0.0.1:8000/docs
python -m app.serve

```


```powershell
$body = @{ url = "https://www.youtube.com/watch?v=g01HPntRJpY"; language_mode = "en" } | ConvertTo-Json
$src = Invoke-RestMethod -Method Post -Uri http://localhost:8000/sources -ContentType "application/json" -Body $body
$src
```

Then check progress (run it again whenever you want an update):

```powershell
$s = Invoke-RestMethod "http://localhost:8000/sources/$($src.id)"
$s.status; $s.progress; $s.clips | Select-Object rank, status, hook_title
```

When `status` says `completed`, get the copy-ready metadata for the first clip and download the video:

```powershell
$clip = $s.clips[0]
Invoke-RestMethod "http://localhost:8000/clips/$($clip.id)/package"
Invoke-WebRequest "http://localhost:8000/clips/$($clip.id)/download" -OutFile clip1.mp4
```
If failed 
```
powershell
$s.error
$s.stages | Format-List stage, status, error
```

To upload a file from your computer, use the real curl, written as `curl.exe`:

```powershell
curl.exe -F "file=@D:\Videos\talk.mp4" -F "language_mode=en" http://localhost:8000/sources/upload
```

If you'd rather not type commands, open http://localhost:8000/docs. Every endpoint there has a **Try it out** button where you can paste the URL and see the response.

Use `python -m app.serve`, not `uvicorn ...`, on Windows: uvicorn picks an event loop that the
async PostgreSQL driver cannot use there, and `app.serve` selects a compatible one.
If captions render in a fallback font, set `SUBTITLE_FONT=Arial` in `.env`.

To set a variable only for the current PowerShell session, the syntax is
`$env:DATABASE_URL = "postgresql://..."` (PowerShell has no `export`).

### macOS / Linux

```bash
cd backend
uv venv --python 3.12 && source .venv/bin/activate && uv pip install -e ".[dev]"
python -m app.worker &     # job worker
python -m app.serve        # API on :8000
pytest                     # unit tests; e2e also needs E2E_DATABASE_URL
```

`LLM_MODE=fake TRANSCRIPTION_PROVIDER=fake` runs the whole pipeline offline with deterministic
outputs (used by the end-to-end test).

## Fallbacks

| Missing | Fallback |
|---|---|
| YuNet face model | OpenCV Haar cascade, then centre crop |
| fastembed models (CLIP / bge-small) | colour histograms (frames), TF-IDF char n-grams (text) |
| `YOUTUBE_API_KEY` | default style profile, no benchmark titles |
| `GROQ_API_KEY` | local faster-whisper; generation falls back to Gemini Flash-Lite |
| `GOOGLE_API_KEY` | clip selection unavailable (long transcripts need Gemini's context window) |

## Licensing

All Python dependencies are MIT / BSD / Apache-2.0 / LGPL (psycopg) / Unlicense (yt-dlp). ffmpeg is
installed from Debian packages. No AGPL or non-commercial components (pyiqa and Ultralytics are
deliberately not used).
