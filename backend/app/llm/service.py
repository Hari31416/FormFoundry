from __future__ import annotations

import json
import logging
from time import perf_counter
from typing import Any

from litellm import acompletion

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _extract_message_text(response: Any) -> str | None:
    choices = getattr(response, "choices", None) or []
    if not choices:
        return None

    message = getattr(choices[0], "message", None)
    if message is None:
        return None

    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        fragments: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                fragments.append(str(item.get("text", "")))
            else:
                text = getattr(item, "text", None)
                if text:
                    fragments.append(str(text))
        return "".join(fragments) or None
    return None


def _extract_usage_payload(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return {}

    metrics: dict[str, int] = {}
    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
        value = usage.get(key) if isinstance(usage, dict) else getattr(usage, key, None)
        if isinstance(value, int):
            metrics[key] = value
    return metrics


async def generate_json(
    *,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any] | None:
    settings = get_settings()
    log_context = {
        "model": settings.llm_model,
        "temperature": settings.llm_temperature,
        "timeout_seconds": settings.llm_timeout_seconds,
        "system_prompt_chars": len(system_prompt),
        "user_prompt_chars": len(user_prompt),
    }
    if not settings.llm_is_configured:
        logger.info(
            "llm.call.skipped",
            extra={
                **log_context,
                "reason": "llm_not_configured",
                "llm_enabled": settings.llm_enabled,
            },
        )
        return None

    request_kwargs: dict[str, Any] = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": settings.llm_temperature,
        "timeout": settings.llm_timeout_seconds,
        "response_format": {"type": "json_object"},
    }
    if settings.llm_api_key:
        request_kwargs["api_key"] = settings.llm_api_key
    if settings.llm_base_url:
        request_kwargs["api_base"] = settings.llm_base_url

    logger.info("llm.call.started", extra=log_context)
    started_at = perf_counter()
    try:
        response = await acompletion(**request_kwargs)
    except Exception:
        logger.exception(
            "llm.call.failed",
            extra={
                **log_context,
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            },
        )
        return None

    content = _extract_message_text(response)
    if not content:
        logger.warning(
            "llm.call.empty_response",
            extra={
                **log_context,
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            },
        )
        return None

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning(
            "llm.call.invalid_json",
            extra={
                **log_context,
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                "response_chars": len(content),
            },
        )
        return None

    logger.info(
        "llm.call.completed",
        extra={
            **log_context,
            "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            "response_chars": len(content),
            **_extract_usage_payload(response),
        },
    )
    return parsed
