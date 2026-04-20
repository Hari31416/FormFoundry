from __future__ import annotations

import logging
from io import BytesIO

import fitz
from pypdf import PdfReader

logger = logging.getLogger(__name__)


class PdfValidationError(ValueError):
    """Raised when an uploaded PDF cannot be accepted for OCR."""


def get_pdf_page_count(payload: bytes) -> int:
    try:
        reader = PdfReader(BytesIO(payload))
    except Exception as exc:  # pragma: no cover - exercised through validation path
        logger.exception(
            "extraction.pdf_parse.failed",
            extra={"payload_bytes": len(payload)},
        )
        raise PdfValidationError("Uploaded PDF could not be read.") from exc

    return len(reader.pages)


def validate_pdf_page_limit(payload: bytes, *, max_pages: int) -> int:
    page_count = get_pdf_page_count(payload)
    if page_count == 0:
        raise PdfValidationError("Uploaded PDF must contain at least one page.")
    if page_count > max_pages:
        raise PdfValidationError(f"Uploaded PDF exceeds the {max_pages}-page limit.")
    return page_count


def render_pdf_pages_to_png(payload: bytes, *, max_pages: int) -> list[bytes]:
    page_count = validate_pdf_page_limit(payload, max_pages=max_pages)
    try:
        document = fitz.open(stream=payload, filetype="pdf")
    except Exception as exc:  # pragma: no cover - exercised through validation path
        logger.exception(
            "extraction.pdf_render.failed",
            extra={"payload_bytes": len(payload), "page_count": page_count},
        )
        raise PdfValidationError("Uploaded PDF could not be rendered for OCR.") from exc

    images: list[bytes] = []
    try:
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            images.append(pixmap.tobytes("png"))
    finally:
        document.close()

    logger.info(
        "extraction.pdf_render.completed",
        extra={
            "payload_bytes": len(payload),
            "page_count": page_count,
            "rendered_pages": len(images),
        },
    )
    return images
