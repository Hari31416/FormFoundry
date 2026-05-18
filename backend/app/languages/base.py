from __future__ import annotations

from abc import ABC, abstractmethod


class BaseLanguageDetectionProvider(ABC):
    """Abstract base class for language detection services."""

    @abstractmethod
    async def detect_language(self, text: str) -> str:
        """Detects the ISO 639-1 language code (e.g. 'hi', 'en') of the input text."""
        pass


class BaseTranslationProvider(ABC):
    """Abstract base class for translation services."""

    @abstractmethod
    async def translate(self, text: str, source: str, destination: str) -> str:
        """Translates text from source language to destination language."""
        pass


class BaseTTSProvider(ABC):
    """Abstract base class for text-to-speech services."""

    @abstractmethod
    async def text_to_speech(
        self, text: str, language: str, gender: str = "female"
    ) -> bytes | None:
        """Converts text into audio bytes (e.g. MP3 format). Returns None on failure."""
        pass


class BaseSTTProvider(ABC):
    """Abstract base class for speech-to-text services."""

    @abstractmethod
    async def speech_to_text(self, audio: str | bytes, language: str) -> str:
        """Transcribes audio content (URL, path, or base64 data) into plain text."""
        pass
