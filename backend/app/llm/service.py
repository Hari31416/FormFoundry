from __future__ import annotations

import json
from typing import Any

from litellm import acompletion

from app.core.config import get_settings


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


async def generate_json(
    *,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any] | None:
    settings = get_settings()
    if not settings.llm_is_configured:
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

    try:
        response = await acompletion(**request_kwargs)
    except Exception:
        return None

    content = _extract_message_text(response)
    if not content:
        return None

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return None
