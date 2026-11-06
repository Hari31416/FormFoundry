from __future__ import annotations

import json
import logging
from base64 import b64encode
from time import perf_counter
from typing import Any

from litellm import acompletion

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _extract_message_payload(content: str) -> list[dict[str, Any]]:
    return [{"type": "text", "text": content}]


def _build_request_kwargs(
    *,
    model: str,
    messages: list[dict[str, Any]],
    response_format: dict[str, Any] | None,
    api_key: str | None,
    api_base: str | None,
) -> dict[str, Any]:
    settings = get_settings()
    request_kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": settings.llm_temperature,
        "timeout": settings.llm_timeout_seconds,
    }
    if response_format is not None:
        request_kwargs["response_format"] = response_format
    if api_key:
        request_kwargs["api_key"] = api_key
    if api_base:
        request_kwargs["api_base"] = api_base
    return request_kwargs


async def _complete_text(
    *,
    model: str,
    messages: list[dict[str, Any]],
    response_format: dict[str, Any] | None,
    log_context: dict[str, Any],
    api_key: str | None,
    api_base: str | None,
) -> str | None:
    request_kwargs = _build_request_kwargs(
        model=model,
        messages=messages,
        response_format=response_format,
        api_key=api_key,
        api_base=api_base,
    )
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

    logger.info(
        "llm.call.completed",
        extra={
            **log_context,
            "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            "response_chars": len(content),
            **_extract_usage_payload(response),
        },
    )
    return content


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

    content = await _complete_text(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        log_context=log_context,
        api_key=settings.llm_api_key,
        api_base=settings.llm_base_url,
    )
    if not content:
        return None

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning(
            "llm.call.invalid_json",
            extra={
                **log_context,
                "response_chars": len(content),
            },
        )
        return None

    if not isinstance(parsed, dict):
        logger.warning("llm.call.invalid_object", extra=log_context)
        return None
    return parsed


async def generate_vision_text(
    *,
    system_prompt: str,
    user_prompt: str,
    media: list[dict[str, Any]],
) -> str | None:
    settings = get_settings()
    model = settings.resolved_vision_model
    log_context = {
        "model": model,
        "temperature": settings.llm_temperature,
        "timeout_seconds": settings.llm_timeout_seconds,
        "system_prompt_chars": len(system_prompt),
        "user_prompt_chars": len(user_prompt),
        "media_count": len(media),
    }
    if not settings.vision_is_configured:
        logger.info(
            "llm.call.skipped",
            extra={
                **log_context,
                "reason": "vision_model_not_configured",
                "llm_enabled": settings.llm_enabled,
            },
        )
        return None

    content_payload = _extract_message_payload(user_prompt)
    for item in media:
        content_payload.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": (
                        f"data:{item['content_type']};base64,"
                        f"{b64encode(item['payload']).decode('ascii')}"
                    ),
                    "detail": "high",
                },
            }
        )

    return await _complete_text(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content_payload},
        ],
        response_format=None,
        log_context=log_context,
        api_key=settings.resolved_vision_api_key,
        api_base=settings.resolved_vision_base_url,
    )
