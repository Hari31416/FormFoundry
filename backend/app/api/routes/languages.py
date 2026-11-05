from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from app.languages.manager import get_language_manager

router = APIRouter()


class LanguageDetectionRequest(BaseModel):
    text: str


class LanguageDetectionResponse(BaseModel):
    language: str


class TTSRequest(BaseModel):
    text: str
    language: str
    gender: str = "female"


class LanguageConfigResponse(BaseModel):
    is_translation_enabled: bool
    is_detection_enabled: bool
    is_tts_enabled: bool
    is_stt_enabled: bool


@router.post("/languages/detect", response_model=LanguageDetectionResponse)
async def detect_language(
    payload: LanguageDetectionRequest,
) -> LanguageDetectionResponse:
    manager = get_language_manager()
    lang = await manager.detect_language(payload.text)
    return LanguageDetectionResponse(language=lang)


@router.post("/languages/tts")
async def text_to_speech(payload: TTSRequest) -> Response:
    manager = get_language_manager()
    if not manager.is_tts_enabled:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Text-to-Speech service is disabled or not configured.",
        )

    audio = await manager.text_to_speech(payload.text, payload.language, payload.gender)
    if audio is None or not audio.audio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to generate audio from the provided text.",
        )

    media_type = {
        "mp3": "audio/mpeg",
        "mpeg": "audio/mpeg",
        "wav": "audio/wav",
        "wave": "audio/wav",
        "ogg": "audio/ogg",
        "opus": "audio/ogg",
        "flac": "audio/flac",
        "aac": "audio/aac",
        "pcm": "audio/pcm",
    }.get((audio.audio_format or "").lower(), "application/octet-stream")
    return Response(content=audio.audio, media_type=media_type)


@router.get("/languages/config", response_model=LanguageConfigResponse)
async def get_language_config() -> LanguageConfigResponse:
    manager = get_language_manager()
    return LanguageConfigResponse(
        is_translation_enabled=manager.is_translation_enabled,
        is_detection_enabled=manager.is_detection_enabled,
        is_tts_enabled=manager.is_tts_enabled,
        is_stt_enabled=manager.is_stt_enabled,
    )
