"""One entry point for every LLM call.

* Each role (selection, vision, generator, judge, helper) has a fallback chain of
  provider:model strings from settings. Models whose API key is missing are skipped.
* Free tiers rate-limit often, so 429/5xx errors trigger the next model in the chain,
  and when the whole chain is exhausted we back off and try again.
* ``llm_mode=fake`` routes calls to deterministic fakes (tests, dry runs).
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from typing import Any, Literal, Sequence, TypeVar

from pydantic import BaseModel

from app.core.config import get_settings

log = logging.getLogger(__name__)

Role = Literal["selection", "vision", "generator", "judge", "helper"]
T = TypeVar("T", bound=BaseModel)

_ROLE_SETTING = {
    "selection": "llm_selection_models",
    "vision": "llm_vision_models",
    "generator": "llm_generator_models",
    "judge": "llm_judge_models",
    "helper": "llm_helper_models",
}


class LLMUnavailable(RuntimeError):
    """No configured model for this role has an API key."""


def _has_key(model_id: str) -> bool:
    provider = model_id.split(":", 1)[0]
    if provider in ("google", "google-gla"):
        return bool(os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"))
    if provider == "groq":
        return bool(os.environ.get("GROQ_API_KEY"))
    return True  # e.g. ollama


def models_for(role: Role) -> list[str]:
    settings = get_settings()
    return [m for m in settings.chain(_ROLE_SETTING[role]) if _has_key(m)]


def role_available(role: Role) -> bool:
    return get_settings().llm_mode == "fake" or bool(models_for(role))


def _is_retryable(exc: Exception) -> bool:
    from pydantic_ai.exceptions import ModelConnectionError

    if isinstance(exc, ModelConnectionError):  # network blip, DNS failure, dropped connection
        return True
    status = getattr(exc, "status_code", None)
    if status in (408, 409, 429, 500, 502, 503, 504):
        return True
    text = str(exc).lower()
    return any(s in text for s in ("rate limit", "resource_exhausted", "429", "overloaded", "timeout",
                                   "temporarily", "unavailable", "connection error", "getaddrinfo"))


def _is_bad_output(exc: Exception) -> bool:
    """The model answered, but not in the requested schema (FallbackModel does not catch this)."""
    from pydantic_ai.exceptions import UnexpectedModelBehavior

    return isinstance(exc, UnexpectedModelBehavior)


async def run_structured(
    role: Role,
    instructions: str,
    prompt: str,
    output_type: type[T],
    images: Sequence[tuple[bytes, str]] = (),
    temperature: float | None = None,
    fake_context: dict[str, Any] | None = None,
) -> T:
    """Run one structured call and return a validated ``output_type`` instance."""
    settings = get_settings()
    if settings.llm_mode == "fake":
        from app.llm import fake

        return fake.respond(role, output_type, prompt, fake_context or {})

    chain = models_for(role)
    if not chain:
        raise LLMUnavailable(f"no model with an API key configured for role '{role}'")

    from pydantic_ai import Agent, BinaryContent
    from pydantic_ai.models.fallback import FallbackModel
    from pydantic_ai.settings import ModelSettings

    model_settings = ModelSettings(timeout=settings.llm_timeout_seconds)
    if temperature is not None:
        model_settings["temperature"] = temperature

    def make_agent(models: list[str]) -> Any:
        model: Any = models[0] if len(models) == 1 else FallbackModel(*models)
        return Agent(model, output_type=output_type, instructions=instructions,
                     model_settings=model_settings, retries=2)

    agent = make_agent(chain)
    user_input: Any = prompt
    if images:
        user_input = [prompt, *[BinaryContent(data=data, media_type=mime) for data, mime in images]]

    last_exc: Exception | None = None
    for attempt in range(1, settings.llm_max_attempts + 1):
        try:
            result = await agent.run(user_input)
            return result.output
        except Exception as exc:  # noqa: BLE001 - provider SDKs raise many types
            last_exc = exc
            if attempt >= settings.llm_max_attempts:
                break
            if _is_bad_output(exc):
                # Malformed output, e.g. gpt-oss calling a made-up 'json' tool: move on to the next model.
                if len(chain) > 1:
                    log.warning("LLM %s: %s gave invalid output (%s); trying %s", role, chain[0], exc, chain[1])
                    chain = chain[1:]
                    agent = make_agent(chain)
                continue
            if not _is_retryable(_root(exc)):
                break
            delay = settings.llm_backoff_seconds * (2 ** (attempt - 1)) * (0.75 + random.random() / 2)
            retry_after = getattr(_root(exc), "retry_after", None)
            if retry_after:
                delay = max(delay, float(retry_after) + 1.0)
            delay = min(delay, 300.0)
            log.warning("LLM %s attempt %d failed (%s); retrying in %.0fs", role, attempt, _root(exc), delay)
            await asyncio.sleep(delay)
    raise RuntimeError(f"LLM call for role '{role}' failed: {_describe(last_exc)}") from last_exc


def _describe(exc: Exception | None) -> str:
    """Spell out every model's error; FallbackModel's own message only counts them."""
    inner = getattr(exc, "exceptions", None)
    if not inner:
        return str(exc)
    return "; ".join(_describe(e)[:300] for e in inner)


def _root(exc: Exception) -> Exception:
    """FallbackModel wraps per-model errors in an ExceptionGroup; inspect the last one."""
    inner = getattr(exc, "exceptions", None)
    if inner:
        return _root(inner[-1])
    return exc
