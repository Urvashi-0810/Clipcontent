-- ClipContext Part 1 schema. Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS sources (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    origin          text NOT NULL CHECK (origin IN ('url', 'upload')),
    url             text,
    title           text,
    file_path       text,
    audio_path      text,
    duration_s      double precision,
    width           integer,
    height          integer,
    fps             double precision,
    language_mode   text NOT NULL DEFAULT 'en' CHECK (language_mode IN ('en', 'hinglish')),
    channel_handle  text,
    status          text NOT NULL DEFAULT 'queued',
    stage           text,
    error           text,
    analysis        jsonb,          -- summary, key topics, niche queries, category
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id           bigserial PRIMARY KEY,
    source_id    uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    clip_id      uuid,
    stage        text NOT NULL,
    status       text NOT NULL CHECK (status IN ('running', 'done', 'error', 'skipped')),
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    seconds      double precision,
    error        text,
    info         jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_stage_uq
    ON pipeline_runs (source_id, COALESCE(clip_id, '00000000-0000-0000-0000-000000000000'::uuid), stage);

CREATE TABLE IF NOT EXISTS transcripts (
    source_id     uuid PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
    provider      text NOT NULL,
    model         text,
    language      text,
    path          text NOT NULL,     -- transcript.json (words + lines)
    word_count    integer,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clips (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    rank          integer,
    t_start       double precision NOT NULL,
    t_end         double precision NOT NULL,
    hook_title    text,
    hook_type     text,
    scores        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- hook, engagement, value, shareability, total
    reasoning     text,
    transcript_text text,
    status        text NOT NULL DEFAULT 'queued',
    stage         text,
    error         text,
    chosen_title_id uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clips_source_idx ON clips (source_id);

CREATE TABLE IF NOT EXISTS evidence_facts (
    id          bigserial PRIMARY KEY,
    clip_id     uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    fact_key    text NOT NULL,            -- S1, O1, F1 ...
    kind        text NOT NULL CHECK (kind IN ('speech', 'ocr', 'frame')),
    t_start     double precision,
    t_end       double precision,
    text        text NOT NULL,
    frame_path  text,
    UNIQUE (clip_id, fact_key)
);

CREATE TABLE IF NOT EXISTS renders (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id      uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    preset       text NOT NULL DEFAULT 'vertical_1080',
    file_path    text NOT NULL,
    thumb_path   text,
    subtitles_path text,
    crop_info    jsonb,
    version      integer NOT NULL DEFAULT 1,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS renders_clip_idx ON renders (clip_id);

CREATE TABLE IF NOT EXISTS niche_profiles (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key     text NOT NULL,
    queries       jsonb NOT NULL,
    language      text,
    benchmark     jsonb NOT NULL DEFAULT '[]'::jsonb,
    style         jsonb NOT NULL DEFAULT '{}'::jsonb,
    search_calls  integer NOT NULL DEFAULT 0,
    fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS niche_profiles_key_idx ON niche_profiles (cache_key, fetched_at DESC);

ALTER TABLE sources ADD COLUMN IF NOT EXISTS niche_profile_id uuid REFERENCES niche_profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS metadata_candidates (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id       uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    pool          text NOT NULL CHECK (pool IN ('title', 'description', 'hashtags')),
    generation    integer NOT NULL DEFAULT 1,
    strategy      text NOT NULL,
    text          text NOT NULL,
    hashtags      jsonb,
    tags          jsonb,
    fact_keys     jsonb NOT NULL DEFAULT '[]'::jsonb,
    filter_flags  jsonb NOT NULL DEFAULT '[]'::jsonb,
    passed_filters boolean NOT NULL DEFAULT true,
    scores        jsonb NOT NULL DEFAULT '{}'::jsonb,
    final_score   double precision,
    rank          integer,
    judge_reason  text,
    conditioned_on uuid,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS metadata_candidates_clip_idx ON metadata_candidates (clip_id, pool, generation);
