from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader


def extract_text_from_pdf_bytes(payload: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(payload))
    except Exception:
        return ""

    fragments: list[str] = []
    for page in reader.pages:
        fragments.append(page.extract_text() or "")
    return "\n".join(fragment for fragment in fragments if fragment.strip())
