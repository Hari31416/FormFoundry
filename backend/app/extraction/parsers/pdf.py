from __future__ import annotations

import logging
from io import BytesIO

from pypdf import PdfReader

logger = logging.getLogger(__name__)


def extract_text_from_pdf_bytes(payload: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(payload))
    except Exception:
        logger.exception(
            "extraction.pdf_parse.failed",
            extra={"payload_bytes": len(payload)},
        )
        return ""

    fragments: list[str] = []
    for page in reader.pages:
        fragments.append(page.extract_text() or "")
    extracted = "\n".join(fragment for fragment in fragments if fragment.strip())
    logger.info(
        "extraction.pdf_parse.completed",
        extra={
            "payload_bytes": len(payload),
            "page_count": len(reader.pages),
            "extracted_chars": len(extracted),
        },
    )
    return extracted
