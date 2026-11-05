from __future__ import annotations

import asyncio
import logging
import os
from contextlib import AsyncExitStack
from pathlib import Path

from dotenv import dotenv_values
from indic_language_utils import (
    DEFAULT_LANGUAGE_REGISTRY,
    DetectionClient,
    Settings,
    STTClient,
    TranslationClient,
    TTSClient,
    TTSOptions,
    TTSResult,
    get_detection_client,
    get_stt_client,
    get_translation_client,
    get_tts_client,
)
from indic_language_utils.errors import LanguageUtilsError

from app.languages.cache import get_cached_translation, set_cached_translation

logger = logging.getLogger(__name__)
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def load_indic_settings() -> tuple[Settings, dict[str, str]]:
    """Load root dotenv credentials and library routes, with process env winning."""
    env = {
        key: value
        for key, value in {
            **dotenv_values(REPOSITORY_ROOT / ".env"),
            **os.environ,
        }.items()
        if value is not None
    }
    return (
        Settings.load(
            path=env.get(
                "ILU_CONFIG_FILE", str(REPOSITORY_ROOT / ".indic-language-utils.toml")
            ),
            start_dir=REPOSITORY_ROOT,
            env=env,
        ),
        env,
    )


class LanguageManager:
    """Reuse Indic clients while keeping the application's language contracts."""

    def __init__(self) -> None:
        self.settings, self.env = load_indic_settings()
        self._stack = AsyncExitStack()
        self._lock = asyncio.Lock()
        self._detection: DetectionClient | None = None
        self._translation: TranslationClient | None = None
        self._tts: TTSClient | None = None
        self._started = False
        self._stt: STTClient | None = None

    @property
    def is_detection_enabled(self) -> bool:
        return bool(self.settings.routes.get("text_language_detection"))

    @property
    def is_translation_enabled(self) -> bool:
        return bool(self.settings.routes.get("translation"))

    @property
    def is_tts_enabled(self) -> bool:
        return bool(self.settings.routes.get("text_to_speech"))

    @property
    def is_stt_enabled(self) -> bool:
        return bool(self.settings.routes.get("speech_to_text"))

    async def start(self) -> None:
        """Open clients lazily, once per application lifetime, without model downloads."""
        async with self._lock:
            if self._started:
                return
            async with AsyncExitStack() as stack:
                if self.is_detection_enabled:
                    detection = await stack.enter_async_context(
                        get_detection_client(self.settings, env=self.env)
                    )
                else:
                    detection = None
                if self.is_translation_enabled:
                    translation = await stack.enter_async_context(
                        get_translation_client(self.settings, env=self.env)
                    )
                else:
                    translation = None
                if self.is_tts_enabled:
                    tts = await stack.enter_async_context(
                        get_tts_client(self.settings, env=self.env)
                    )
                else:
                    tts = None
                if self.is_stt_enabled:
                    stt = await stack.enter_async_context(
                        get_stt_client(self.settings, env=self.env)
                    )
                else:
                    stt = None
                self._stt = stt
                self._stack = stack.pop_all()
                self._detection, self._translation, self._tts = (
                    detection,
                    translation,
                    tts,
                )
                self._started = True

    async def close(self) -> None:
        async with self._lock:
            await self._stack.aclose()
            self._detection = self._translation = self._tts = None
            self._stt = None
            self._started = False

    async def detect_language(self, text: str) -> str:
        if not self.is_detection_enabled or not text.strip():
            return "en"
        try:
            await self.start()
            assert self._detection is not None
            result = await self._detection.detect(text)
            # Conversation metadata and frontend selectors use bare ISO codes.
            return result.language.language if result.language is not None else "en"
        except (LanguageUtilsError, ValueError):
            logger.warning("Indic language detection failed", exc_info=True)
            return "en"

    async def translate(self, text: str, source: str, destination: str) -> str:
        if not self.is_translation_enabled or not text.strip():
            return text
        source = str(DEFAULT_LANGUAGE_REGISTRY.normalize(source))
        destination = str(DEFAULT_LANGUAGE_REGISTRY.normalize(destination))
        if source == destination:
            return text
        cached = await get_cached_translation(text, source, destination)
        if cached is not None:
            return cached
        await self.start()
        assert self._translation is not None
        result = await self._translation.translate(text, source, destination)
        if not result.text.strip():
            raise ValueError("Translation returned empty text")
        await set_cached_translation(text, source, destination, result.text)
        return result.text

    async def text_to_speech(
        self, text: str, language: str, gender: str = "female"
    ) -> TTSResult | None:
        if not self.is_tts_enabled or not text.strip():
            return None
        try:
            await self.start()
            assert self._tts is not None
            return await self._tts.synthesize(
                text,
                language=str(DEFAULT_LANGUAGE_REGISTRY.normalize(language)),
                options=TTSOptions(
                    provider_parameters={
                        "edge_tts": {"gender": gender},
                        "bhashini": {"gender": gender},
                    }
                ),
            )
        except (LanguageUtilsError, ValueError):
            logger.warning("Indic speech synthesis failed", exc_info=True)
            return None

    async def speech_to_text(
        self,
        audio: bytes,
        language: str,
        *,
        audio_format: str,
        sampling_rate: int,
    ) -> str:
        """Transcribe audio in its actual format; callers must resample if needed."""
        if not self.is_stt_enabled or not audio:
            return ""
        await self.start()
        assert self._stt is not None
        result = await self._stt.transcribe(
            audio,
            language=language,
            audio_format=audio_format,
            sampling_rate=sampling_rate,
        )
        return result.text


_manager: LanguageManager | None = None


def get_language_manager() -> LanguageManager:
    global _manager
    if _manager is None:
        _manager = LanguageManager()
    return _manager


async def close_language_manager() -> None:
    global _manager
    if _manager is not None:
        try:
            await _manager.close()
        finally:
            _manager = None
