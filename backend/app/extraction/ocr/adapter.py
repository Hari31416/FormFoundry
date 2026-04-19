from __future__ import annotations


def extract_text_from_image_bytes(payload: bytes) -> str:
    try:
        return payload.decode("utf-8")
    except UnicodeDecodeError:
        return ""
