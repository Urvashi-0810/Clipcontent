"""Typed outputs requested from LLMs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

HookType = Literal["question", "bold_claim", "statistic", "story", "contrast", "how_to", "emotional", "none"]


# ------------------------------------------------------------- clip selection
class SelectedClip(BaseModel):
    start_line: str = Field(description="id of the first transcript line, e.g. L120")
    end_line: str = Field(description="id of the last transcript line, e.g. L131")
    hook_title: str = Field(description="3-9 word on-screen headline grounded in the clip")
    hook_type: HookType = "none"
    hook: int = Field(ge=0, le=25, description="strength of the first 3 seconds")
    engagement: int = Field(ge=0, le=25)
    value: int = Field(ge=0, le=25)
    shareability: int = Field(ge=0, le=25)
    reasoning: str = Field(description="why this works as a standalone short, citing what is said")


class VideoProfile(BaseModel):
    summary: str = Field(description="3-5 sentence summary of the whole video")
    key_topics: list[str] = Field(default_factory=list, max_length=12)
    niche_queries: list[str] = Field(
        default_factory=list, description="3-5 YouTube search queries that find videos in the same niche"
    )
    youtube_category_id: str = Field(default="22", description="YouTube category id, e.g. 27 Education, 28 Science & Tech")


class WindowSelection(BaseModel):
    summary: str
    clips: list[SelectedClip]


class FullSelection(VideoProfile):
    clips: list[SelectedClip]


class RerankItem(BaseModel):
    candidate_id: str
    total: int = Field(ge=0, le=100, description="comparative clip-worthiness 0-100")
    keep: bool = True


class Rerank(VideoProfile):
    ranking: list[RerankItem]


# ----------------------------------------------------------------- vision
class FrameCaption(BaseModel):
    index: int
    caption: str = Field(description="one factual sentence describing what is visible")
    visible_text: str = Field(default="", description="text readable on screen, verbatim, or empty")


class FrameCaptions(BaseModel):
    frames: list[FrameCaption]


# ----------------------------------------------------------- style profile
class StyleTemplates(BaseModel):
    templates: list[str] = Field(default_factory=list, description="3-5 reusable title formulas with placeholders")
    tone: str = Field(default="", description="one sentence describing tone and voice")
    notes: list[str] = Field(default_factory=list, description="short observations about descriptions and hashtags")


# ------------------------------------------------------------- generation
class TextCandidate(BaseModel):
    strategy: str
    text: str
    fact_keys: list[str] = Field(default_factory=list, description="evidence ids this candidate relies on")


class TextCandidates(BaseModel):
    candidates: list[TextCandidate]


class HashtagCandidate(BaseModel):
    strategy: str
    hashtags: list[str] = Field(description="visible hashtags, with or without #")
    tags: list[str] = Field(description="hidden YouTube tags / keywords")
    fact_keys: list[str] = Field(default_factory=list)


class HashtagCandidates(BaseModel):
    candidates: list[HashtagCandidate]


# ---------------------------------------------------------------- judging
class JudgeItem(BaseModel):
    label: str
    grounding: int = Field(ge=1, le=5)
    hook: int = Field(ge=1, le=5)
    style_match: int = Field(ge=1, le=5)
    search_intent: int = Field(ge=1, le=5)
    honesty: int = Field(ge=1, le=5)
    reason: str = ""


class JudgeScores(BaseModel):
    items: list[JudgeItem]


class PairVerdict(BaseModel):
    pair_id: str
    winner: Literal["A", "B"]


class PairVerdicts(BaseModel):
    verdicts: list[PairVerdict]
