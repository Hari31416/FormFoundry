from __future__ import annotations

import base64
import logging
import os
import re
import tempfile
import urllib.parse

import requests
from pydub import AudioSegment
from tenacity import retry, stop_after_attempt, wait_random

from app.core.config import get_settings
from app.languages.base import (
    BaseLanguageDetectionProvider,
    BaseSTTProvider,
    BaseTranslationProvider,
    BaseTTSProvider,
)

logger = logging.getLogger(__name__)

# Standard Bhashini Retry Configuration
BHASHINI_NUM_RETRIES = int(os.getenv("BHASHINI_NUM_RETRIES", "2"))
retry_tenacity = retry(
    stop=stop_after_attempt(BHASHINI_NUM_RETRIES + 1),
    reraise=True,
    wait=wait_random(min=0.5, max=2.0),
)


def is_url(s: str) -> bool:
    """Checks if a string is a valid HTTP/HTTPS URL."""
    try:
        parsed = urllib.parse.urlparse(s)
        return bool(parsed.scheme and parsed.netloc)
    except Exception:
        return False


def is_base64(s: str) -> bool:
    """Checks if a string is valid Base64 encoded data."""
    if not s:
        return False
    # Basic check for base64 characters
    return bool(re.match(r"^[A-Za-z0-9+/]+={0,2}$", s) and len(s) % 4 == 0)


def generate_temp_filename(ext: str) -> str:
    """Generates a temporary file path with the specified extension."""
    fd, path = tempfile.mkstemp(suffix=f".{ext}")
    os.close(fd)
    return path


def get_encoded_string(audio: str | bytes) -> tuple[str, bytes]:
    """Converts input audio data into the specific 16kHz mono WAV format required by Bhashini."""
    local_filename = None
    tmp_wav_filename = None
    try:
        if isinstance(audio, bytes):
            local_filename = generate_temp_filename("mp3")
            with open(local_filename, "wb") as f:
                f.write(audio)
        elif is_url(audio):
            local_filename = generate_temp_filename("mp3")
            response = requests.get(audio, timeout=15)
            response.raise_for_status()
            with open(local_filename, "wb") as f:
                f.write(response.content)
        elif is_base64(audio):
            local_filename = generate_temp_filename("mp3")
            decoded_audio_content = base64.b64decode(audio)
            with open(local_filename, "wb") as f:
                f.write(decoded_audio_content)
        else:
            # Assume it's a file path
            local_filename = audio

        # Load file and export to standard MP3 to normalize
        output_file = AudioSegment.from_file(local_filename)
        mp3_output_file = output_file.export(local_filename, format="mp3")

        # Load and normalize audio parameters (16kHz, mono) for ASR
        given_audio = AudioSegment.from_file(mp3_output_file)
        given_audio = given_audio.set_frame_rate(16000)
        given_audio = given_audio.set_channels(1)

        tmp_wav_filename = generate_temp_filename("wav")
        given_audio.export(tmp_wav_filename, format="wav", codec="pcm_s16le")

        with open(tmp_wav_filename, "rb") as wav_file:
            wav_file_content = wav_file.read()

        encoded_string = base64.b64encode(wav_file_content).decode("ascii")
        return encoded_string, wav_file_content

    finally:
        # Clean up temporary files safely
        if (
            local_filename
            and os.path.exists(local_filename)
            and local_filename != audio
        ):
            try:
                os.remove(local_filename)
            except Exception:
                pass
        if tmp_wav_filename and os.path.exists(tmp_wav_filename):
            try:
                os.remove(tmp_wav_filename)
            except Exception:
                pass


class BhashiniLanguageDetectionProvider(BaseLanguageDetectionProvider):
    """Bhashini-powered language detection."""

    @retry_tenacity
    async def detect_language(self, text: str) -> str:
        settings = get_settings()
        if not settings.bhashini_api_key:
            logger.warning("Bhashini API Key not configured. Skipping detection.")
            return "en"

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "txt-lang-detection",
                    "config": {
                        "serviceId": settings.bhashini_lang_detection_service_id
                    },
                }
            ],
            "inputData": {"input": [{"source": text}]},
        }
        headers = {
            "Authorization": settings.bhashini_api_key,
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                settings.bhashini_endpoint_url,
                headers=headers,
                json=payload,
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            detected_lang = data["pipelineResponse"][0]["output"][0]["langPrediction"][
                0
            ]["langCode"]

            if not detected_lang or detected_lang == "unknown":
                return "en"
            return str(detected_lang)
        except Exception as e:
            logger.error(
                f"Bhashini language detection failed: {e}. Defaulting to 'en'."
            )
            return "en"


class BhashiniTranslationProvider(BaseTranslationProvider):
    """Bhashini-powered translation service."""

    @retry_tenacity
    async def translate(self, text: str, source: str, destination: str) -> str:
        if source == destination:
            return text

        settings = get_settings()
        if not settings.bhashini_api_key:
            logger.warning("Bhashini API Key not configured. Skipping translation.")
            return text

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": source,
                            "targetLanguage": destination,
                        },
                        "serviceId": settings.bhashini_translation_service_id,
                    },
                }
            ],
            "inputData": {"input": [{"source": text}]},
        }
        headers = {
            "Authorization": settings.bhashini_api_key,
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                settings.bhashini_endpoint_url,
                headers=headers,
                json=payload,
                timeout=15,
            )
            response.raise_for_status()
            translated_text = response.json()["pipelineResponse"][0]["output"][0][
                "target"
            ]

            if not translated_text or len(translated_text) < min(3, len(text) // 2):
                raise ValueError(
                    f"Translated text '{translated_text}' is empty or too short."
                )

            return str(translated_text)
        except Exception as e:
            logger.error(f"Bhashini translation failed: {e}")
            raise e


class BhashiniTTSProvider(BaseTTSProvider):
    """Bhashini-powered Text-to-Speech (TTS)."""

    def __init__(self) -> None:
        TTS_IITM = "Bhashini/IITM/TTS"
        TTS_IISC = "Bhashini/IISC/TTS"
        self.tts_mapping = {
            "as": TTS_IITM,
            "mai": TTS_IISC,
            "bn": TTS_IISC,
            "brx": TTS_IITM,
            "bhoj": TTS_IISC,
            "doi": TTS_IITM,
            "en": TTS_IISC,
            "gu": TTS_IISC,
            "gom": TTS_IITM,
            "hi": TTS_IISC,
            "kn": TTS_IISC,
            "ks": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
            "mag": TTS_IISC,
            "ml": TTS_IITM,
            "mni": TTS_IITM,
            "mr": TTS_IISC,
            "ne": TTS_IITM,
            "or": TTS_IITM,
            "pa": TTS_IITM,
            "raj": TTS_IITM,
            "sat": TTS_IITM,
            "sd": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
            "ta": TTS_IITM,
            "te": TTS_IISC,
            "ur": TTS_IITM,
        }

    @retry_tenacity
    async def text_to_speech(
        self, text: str, language: str, gender: str = "female"
    ) -> bytes | None:
        settings = get_settings()
        if not settings.bhashini_api_key:
            logger.warning("Bhashini API Key not configured. Skipping TTS.")
            return None

        service_id = self.tts_mapping.get(language, "Bhashini/IISC/TTS")

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language": {"sourceLanguage": language},
                        "audioFormat": "mp3",
                        "serviceId": service_id,
                        "gender": gender,
                    },
                }
            ],
            "inputData": {
                "input": [{"source": text}],
                "audio": [{"audioContent": None}],
            },
        }
        headers = {
            "Authorization": settings.bhashini_api_key,
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                settings.bhashini_endpoint_url,
                headers=headers,
                json=payload,
                timeout=15,
            )
            response.raise_for_status()
            audio_content = response.json()["pipelineResponse"][0]["audio"][0][
                "audioContent"
            ]
            return base64.b64decode(audio_content)
        except Exception as e:
            logger.error(f"Bhashini TTS failed: {e}")
            return None


class BhashiniSTTProvider(BaseSTTProvider):
    """Bhashini-powered Speech-to-Text (STT / ASR)."""

    def __init__(self) -> None:
        asr_default = "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4"
        self.asr_mapping = {
            "bn": asr_default,
            "en": "ai4bharat/whisper-medium-en--gpu--t4",
            "gu": asr_default,
            "hi": "ai4bharat/conformer-hi-gpu--t4",
            "kn": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
            "ml": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
            "mr": asr_default,
            "or": asr_default,
            "pa": asr_default,
            "sa": asr_default,
            "ta": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
            "te": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
            "ur": asr_default,
        }

    @retry_tenacity
    async def speech_to_text(self, audio: str | bytes, language: str) -> str:
        settings = get_settings()
        if not settings.bhashini_api_key:
            logger.warning("Bhashini API Key not configured. Skipping STT.")
            return ""

        encoded_string, _ = get_encoded_string(audio)
        service_id = self.asr_mapping.get(
            language, "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4"
        )

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "asr",
                    "config": {
                        "language": {"sourceLanguage": language},
                        "preProcessors": ["denoiser"],
                        "serviceId": service_id,
                    },
                }
            ],
            "inputData": {"audio": [{"audioContent": encoded_string}]},
        }
        headers = {
            "Authorization": settings.bhashini_api_key,
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                settings.bhashini_endpoint_url,
                headers=headers,
                json=payload,
                timeout=20,
            )
            response.raise_for_status()
            text = response.json()["pipelineResponse"][0]["output"][0]["source"]
            return str(text)
        except Exception as e:
            logger.error(f"Bhashini STT failed: {e}")
            raise e
