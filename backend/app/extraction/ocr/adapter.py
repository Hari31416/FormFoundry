from __future__ import annotations

import logging

from app.llm.service import generate_vision_text
from app.prompts import render_prompt

logger = logging.getLogger(__name__)


async def extract_text_from_image_bytes(
    payload: bytes,
    *,
    content_type: str,
    context_label: str = "uploaded image",
) -> str:
    extracted = await generate_vision_text(
        system_prompt=render_prompt("ocr_system.jinja2"),
        user_prompt=render_prompt("ocr_user.jinja2", context_label=context_label),
        media=[{"content_type": content_type, "payload": payload}],
    )
    if extracted is None:
        logger.error(
            "extraction.image_ocr.failed",
            extra={
                "content_type": content_type,
                "context_label": context_label,
                "payload_bytes": len(payload),
            },
        )
        raise RuntimeError("Vision OCR failed for uploaded evidence.")

    normalized = extracted.strip()
    logger.info(
        "extraction.image_ocr.completed",
        extra={
            "content_type": content_type,
            "context_label": context_label,
            "payload_bytes": len(payload),
            "extracted_chars": len(normalized),
        },
    )
    return normalized
