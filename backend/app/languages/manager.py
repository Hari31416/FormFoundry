from __future__ import annotations

import logging

from app.core.config import get_settings
from app.languages.base import (
    BaseLanguageDetectionProvider,
    BaseSTTProvider,
    BaseTranslationProvider,
    BaseTTSProvider,
)
from app.languages.bhashini import (
    BhashiniLanguageDetectionProvider,
    BhashiniSTTProvider,
    BhashiniTranslationProvider,
    BhashiniTTSProvider,
)
from app.languages.google import (
    GoogleLanguageDetectionProvider,
    GoogleTranslationProvider,
)
from app.languages.langdetect_provider import LangdetectLanguageDetectionProvider

logger = logging.getLogger(__name__)

# Registries of available providers for each language feature
DETECTION_PROVIDERS: dict[str, type[BaseLanguageDetectionProvider]] = {
    "bhashini": BhashiniLanguageDetectionProvider,
    "google": GoogleLanguageDetectionProvider,
    "langdetect": LangdetectLanguageDetectionProvider,
}

TRANSLATION_PROVIDERS: dict[str, type[BaseTranslationProvider]] = {
    "bhashini": BhashiniTranslationProvider,
    "google": GoogleTranslationProvider,
}

TTS_PROVIDERS: dict[str, type[BaseTTSProvider]] = {
    "bhashini": BhashiniTTSProvider,
}

STT_PROVIDERS: dict[str, type[BaseSTTProvider]] = {
    "bhashini": BhashiniSTTProvider,
}


class LanguageManager:
    """Central orchestrator for language and speech features.

    Initializes and holds the active provider for each language service based on
    environment variables.
    Provides robust fallbacks if any feature is turned off (configured as None).
    """

    def __init__(self) -> None:
        settings = get_settings()

        # Initialize Language Detection Provider
        det_prov_name = (
            (settings.language_detection_service_provider or "").strip().lower()
        )
        if det_prov_name in DETECTION_PROVIDERS:
            self._detection_provider = DETECTION_PROVIDERS[det_prov_name]()
            logger.info(
                f"Language Detection initialized with provider: '{det_prov_name}'"
            )
        else:
            self._detection_provider = None
            if det_prov_name:
                logger.warning(
                    f"Language detection provider '{det_prov_name}' "
                    "is not supported. Feature is disabled."
                )
            else:
                logger.info("Language Detection is disabled.")

        # Initialize Translation Provider
        trans_prov_name = (
            (settings.language_translation_service_provider or "").strip().lower()
        )
        if trans_prov_name in TRANSLATION_PROVIDERS:
            self._translation_provider = TRANSLATION_PROVIDERS[trans_prov_name]()
            logger.info(f"Translation initialized with provider: '{trans_prov_name}'")
        else:
            self._translation_provider = None
            if trans_prov_name:
                logger.warning(
                    f"Translation provider '{trans_prov_name}' "
                    "is not supported. Feature is disabled."
                )
            else:
                logger.info("Translation is disabled.")

        # Initialize TTS Provider
        tts_prov_name = (settings.tts_service_provider or "").strip().lower()
        if tts_prov_name in TTS_PROVIDERS:
            self._tts_provider = TTS_PROVIDERS[tts_prov_name]()
            logger.info(f"Text-to-Speech initialized with provider: '{tts_prov_name}'")
        else:
            self._tts_provider = None
            if tts_prov_name:
                logger.warning(
                    f"TTS provider '{tts_prov_name}' is not supported. Feature is disabled."
                )
            else:
                logger.info("Text-to-Speech is disabled.")

        # Initialize STT Provider
        stt_prov_name = (settings.stt_service_provider or "").strip().lower()
        if stt_prov_name in STT_PROVIDERS:
            self._stt_provider = STT_PROVIDERS[stt_prov_name]()
            logger.info(f"Speech-to-Text initialized with provider: '{stt_prov_name}'")
        else:
            self._stt_provider = None
            if stt_prov_name:
                logger.warning(
                    f"STT provider '{stt_prov_name}' is not supported. Feature is disabled."
                )
            else:
                logger.info("Speech-to-Text is disabled.")

    @property
    def is_detection_enabled(self) -> bool:
        return self._detection_provider is not None

    @property
    def is_translation_enabled(self) -> bool:
        return self._translation_provider is not None

    @property
    def is_tts_enabled(self) -> bool:
        return self._tts_provider is not None

    @property
    def is_stt_enabled(self) -> bool:
        return self._stt_provider is not None

    async def detect_language(self, text: str) -> str:
        """Detects language of input text. Defaults to 'en' if feature is disabled."""
        if not self._detection_provider or not text or not text.strip():
            return "en"
        return await self._detection_provider.detect_language(text)

    async def translate(self, text: str, source: str, destination: str) -> str:
        """Translates text.

        Returns original text if source == destination or feature is disabled.
        """
        if source == destination or not text or not text.strip():
            return text

        if not self._translation_provider:
            logger.debug(
                "Translation is disabled or provider not set. Returning original text."
            )
            return text

        return await self._translation_provider.translate(text, source, destination)

    async def text_to_speech(
        self, text: str, language: str, gender: str = "female"
    ) -> bytes | None:
        """Converts text to speech bytes. Returns None if feature is disabled."""
        if not self._tts_provider or not text or not text.strip():
            return None
        return await self._tts_provider.text_to_speech(text, language, gender)

    async def speech_to_text(self, audio: str | bytes, language: str) -> str:
        """Transcribes audio data. Returns empty string if feature is disabled."""
        if not self._stt_provider or not audio:
            return ""
        return await self._stt_provider.speech_to_text(audio, language)


# Global singleton instance of LanguageManager
_manager: LanguageManager | None = None


def get_language_manager() -> LanguageManager:
    """Helper function to fetch the global LanguageManager singleton."""
    global _manager
    if _manager is None:
        _manager = LanguageManager()
    return _manager
