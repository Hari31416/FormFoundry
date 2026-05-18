from __future__ import annotations

import logging

from googletrans import Translator

from app.languages.base import BaseLanguageDetectionProvider, BaseTranslationProvider

logger = logging.getLogger(__name__)


class GoogleLanguageDetectionProvider(BaseLanguageDetectionProvider):
    """Google-powered language detection using googletrans."""

    async def detect_language(self, text: str) -> str:
        if not text or not text.strip():
            return "en"

        try:
            translator = Translator()
            result = await translator.detect(text)
            language = result.lang

            if not language or language == "unknown":
                logger.warning(
                    f"Google language detection returned unknown/None for query: "
                    f"'{text[:20]}...'. Defaulting to 'en'."
                )
                return "en"

            return str(language)
        except Exception as e:
            logger.error(f"Google language detection failed: {e}. Defaulting to 'en'.")
            return "en"


class GoogleTranslationProvider(BaseTranslationProvider):
    """Google-powered translation using googletrans."""

    async def translate(self, text: str, source: str, destination: str) -> str:
        if source == destination:
            return text

        if not text or not text.strip():
            return text

        try:
            translator = Translator()
            result = await translator.translate(text, dest=destination, src=source)
            translated_text = result.text

            if (
                translated_text is None
                or translated_text == ""
                or len(translated_text) < min(3, len(text) // 2)
            ):
                error_message = (
                    f"Google translated text (length={len(translated_text or '')}) "
                    f"is too short or empty compared to source."
                )
                logger.error(error_message)
                raise ValueError(error_message)

            return str(translated_text)
        except Exception as e:
            logger.error(f"Google translation failed: {e}")
            raise e
