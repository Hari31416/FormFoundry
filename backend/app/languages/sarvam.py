from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_random

from app.core.config import get_settings
from app.languages.base import (
    BaseLanguageDetectionProvider,
    BaseTranslationProvider,
    BaseTTSProvider,
)

logger = logging.getLogger(__name__)

SARVAM_NUM_RETRIES = 2
retry_tenacity = retry(
    stop=stop_after_attempt(SARVAM_NUM_RETRIES + 1),
    reraise=True,
    wait=wait_random(min=0.5, max=2.0),
)

APP_TO_SARVAM_LANGUAGE_CODES = {
    "as": "as-IN",
    "bn": "bn-IN",
    "brx": "brx-IN",
    "doi": "doi-IN",
    "en": "en-IN",
    "gu": "gu-IN",
    "hi": "hi-IN",
    "kn": "kn-IN",
    "kok": "kok-IN",
    "ks": "ks-IN",
    "mai": "mai-IN",
    "ml": "ml-IN",
    "mni": "mni-IN",
    "mr": "mr-IN",
    "ne": "ne-IN",
    "or": "od-IN",
    "pa": "pa-IN",
    "sa": "sa-IN",
    "sat": "sat-IN",
    "sd": "sd-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "ur": "ur-IN",
}
SARVAM_TO_APP_LANGUAGE_CODES = {
    value.lower(): key for key, value in APP_TO_SARVAM_LANGUAGE_CODES.items()
}


def to_sarvam_language_code(language: str) -> str:
    normalized = language.strip()
    if not normalized:
        return "en-IN"
    if "-" in normalized:
        return normalized
    return APP_TO_SARVAM_LANGUAGE_CODES.get(normalized.lower(), f"{normalized}-IN")


def to_app_language_code(language: str | None) -> str:
    if not language:
        return "en"
    normalized = language.strip()
    if not normalized:
        return "en"
    mapped = SARVAM_TO_APP_LANGUAGE_CODES.get(normalized.lower())
    if mapped:
        return mapped
    return normalized.split("-", 1)[0].lower()


class SarvamClientMixin:
    def _headers(self) -> dict[str, str] | None:
        settings = get_settings()
        if not settings.sarvam_api_key:
            logger.warning("Sarvam API key is not configured.")
            return None
        return {
            "api-subscription-key": settings.sarvam_api_key,
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        headers = self._headers()
        if headers is None:
            raise RuntimeError("Sarvam API key is not configured.")

        url = f"{settings.sarvam_base_url.rstrip('/')}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=settings.sarvam_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError("Sarvam response was not a JSON object.")
            return data


class SarvamLanguageDetectionProvider(SarvamClientMixin, BaseLanguageDetectionProvider):
    """Sarvam language detection provider using the /text-lid endpoint."""

    @retry_tenacity
    async def detect_language(self, text: str) -> str:
        if not text.strip():
            return "en"
        if not get_settings().sarvam_api_key:
            logger.warning("Sarvam API key not configured. Skipping detection.")
            return "en"

        try:
            data = await self._post("/text-lid", {"input": text})
            return to_app_language_code(data.get("language_code"))
        except Exception as exc:
            logger.error(
                "Sarvam language detection failed: %s. Defaulting to 'en'.", exc
            )
            return "en"


class SarvamTranslationProvider(SarvamClientMixin, BaseTranslationProvider):
    """Sarvam translation provider using the /translate endpoint."""

    @retry_tenacity
    async def translate(self, text: str, source: str, destination: str) -> str:
        if source == destination or not text.strip():
            return text
        settings = get_settings()
        if not settings.sarvam_api_key:
            logger.warning("Sarvam API key not configured. Skipping translation.")
            return text

        payload = {
            "input": text,
            "source_language_code": to_sarvam_language_code(source),
            "target_language_code": to_sarvam_language_code(destination),
            "mode": settings.sarvam_translation_mode,
            "model": settings.sarvam_translation_model,
            "numerals_format": settings.sarvam_numerals_format,
        }

        try:
            data = await self._post("/translate", payload)
            translated_text = data.get("translated_text")
            if not isinstance(translated_text, str) or not translated_text.strip():
                raise ValueError(
                    "Sarvam translation response did not include translated_text."
                )
            return translated_text
        except Exception as exc:
            logger.error("Sarvam translation failed: %s", exc)
            raise


class SarvamTTSProvider(SarvamClientMixin, BaseTTSProvider):
    """Sarvam text-to-speech provider using the /text-to-speech endpoint."""

    @retry_tenacity
    async def text_to_speech(
        self, text: str, language: str, gender: str = "female"
    ) -> bytes | None:
        if not text.strip():
            return None
        settings = get_settings()
        if not settings.sarvam_api_key:
            logger.warning("Sarvam API key not configured. Skipping TTS.")
            return None

        payload = {
            "text": text,
            "target_language_code": to_sarvam_language_code(language),
            "speaker": settings.sarvam_tts_speaker,
            "pace": settings.sarvam_tts_pace,
            "speech_sample_rate": settings.sarvam_tts_sample_rate,
            "model": settings.sarvam_tts_model,
            "output_audio_codec": settings.sarvam_tts_audio_codec,
            "temperature": settings.sarvam_tts_temperature,
        }

        try:
            data = await self._post("/text-to-speech", payload)
            audios = data.get("audios")
            if not isinstance(audios, list) or not audios:
                raise ValueError("Sarvam TTS response did not include audios.")
            audio = audios[0]
            if not isinstance(audio, str) or not audio:
                raise ValueError("Sarvam TTS audio payload was empty.")
            return base64.b64decode(audio)
        except Exception as exc:
            logger.error("Sarvam TTS failed: %s", exc)
            return None
