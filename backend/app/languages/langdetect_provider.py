from __future__ import annotations

import logging

import langdetect
from langdetect.lang_detect_exception import LangDetectException

from app.languages.base import BaseLanguageDetectionProvider

logger = logging.getLogger(__name__)


class LangdetectLanguageDetectionProvider(BaseLanguageDetectionProvider):
    """Offline language detection using the langdetect library."""

    async def detect_language(self, text: str) -> str:
        if not text or not text.strip():
            return "en"

        try:
            # langdetect is a lightweight CPU-bound library; running directly is extremely fast.
            language = langdetect.detect(text)

            if not language or language == "unknown":
                return "en"

            return str(language)
        except LangDetectException as e:
            logger.warning(
                f"langdetect failed to identify language for query: '{text[:20]}...' "
                f"(error: {e}). Defaulting to 'en'."
            )
            return "en"
        except Exception as e:
            logger.error(f"Offline language detection failed: {e}. Defaulting to 'en'.")
            return "en"
