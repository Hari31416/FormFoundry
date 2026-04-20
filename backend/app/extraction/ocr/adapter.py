from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def extract_text_from_image_bytes(payload: bytes) -> str:
    try:
        extracted = payload.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning(
            "extraction.image_parse.failed",
            extra={"payload_bytes": len(payload)},
        )
        return ""
    logger.info(
        "extraction.image_parse.completed",
        extra={"payload_bytes": len(payload), "extracted_chars": len(extracted)},
    )
    return extracted
