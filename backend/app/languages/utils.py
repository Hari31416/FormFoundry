from __future__ import annotations

import logging

from app.languages.manager import get_language_manager

logger = logging.getLogger(__name__)


async def process_incoming_text(text: str, source_language: str = "en") -> str:
    """Translates incoming text from source language to English.

    If source_language is 'en', or if translation is disabled/fails,
    returns the original text.
    """
    if source_language == "en" or not text or not text.strip():
        return text
    try:
        manager = get_language_manager()
        return await manager.translate(text, source_language, "en")
    except Exception as e:
        logger.error(
            f"process_incoming_text failed for source_language={source_language}: {e}. "
            "Using original text."
        )
        return text


async def process_outgoing_text(text: str, target_language: str = "en") -> str:
    """Translates outgoing text from English to target language.

    If target_language is 'en', or if translation is disabled/fails,
    returns the original text.
    """
    if target_language == "en" or not text or not text.strip():
        return text
    try:
        manager = get_language_manager()
        return await manager.translate(text, "en", target_language)
    except Exception as e:
        logger.error(
            f"process_outgoing_text failed for target_language={target_language}: {e}. "
            "Using original text."
        )
        return text
