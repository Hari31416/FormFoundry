from __future__ import annotations

import base64
import logging
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.languages.manager as manager_module
import app.languages.utils as lang_utils
from app.core.config import get_settings
from app.languages.bhashini import (
    BhashiniSTTProvider,
    BhashiniTranslationProvider,
    BhashiniTTSProvider,
)
from app.languages.google import (
    GoogleLanguageDetectionProvider,
    GoogleTranslationProvider,
)
from app.languages.langdetect_provider import LangdetectLanguageDetectionProvider
from app.languages.manager import LanguageManager
from app.languages.sarvam import (
    SarvamLanguageDetectionProvider,
    SarvamTranslationProvider,
    SarvamTTSProvider,
)

logger = logging.getLogger(__name__)


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    manager_module._manager = None
    yield
    get_settings.cache_clear()
    manager_module._manager = None


@pytest.mark.asyncio
async def test_manager_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    # Clear any active configurations directly on the settings singleton
    settings = get_settings()
    monkeypatch.setattr(settings, "language_detection_service_provider", None)
    monkeypatch.setattr(settings, "language_translation_service_provider", None)
    monkeypatch.setattr(settings, "tts_service_provider", None)
    monkeypatch.setattr(settings, "stt_service_provider", None)
    manager_module._manager = None

    mgr = LanguageManager()

    assert not mgr.is_detection_enabled
    assert not mgr.is_translation_enabled
    assert not mgr.is_tts_enabled
    assert not mgr.is_stt_enabled

    # Call methods to ensure graceful fallbacks
    assert await mgr.detect_language("नमस्ते") == "en"
    assert await mgr.translate("Hello", "en", "hi") == "Hello"
    assert await mgr.text_to_speech("Hello", "en") is None
    assert await mgr.speech_to_text(b"mock_audio", "hi") == ""


@pytest.mark.asyncio
async def test_langdetect_offline_detection(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "language_detection_service_provider", "langdetect")
    manager_module._manager = None

    mgr = LanguageManager()
    assert mgr.is_detection_enabled
    assert isinstance(mgr._detection_provider, LangdetectLanguageDetectionProvider)

    # Test English detection
    assert await mgr.detect_language("This is a simple English sentence.") == "en"

    # Test Hindi detection (langdetect returns 'hi')
    assert await mgr.detect_language("यह एक साधारण हिंदी वाक्य है।") == "hi"

    # Test empty/blank fallback
    assert await mgr.detect_language("   ") == "en"
    assert await mgr.detect_language("12345 !!!") == "en"


@pytest.mark.asyncio
async def test_manager_provider_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "language_detection_service_provider", "Google")
    monkeypatch.setattr(settings, "language_translation_service_provider", "Bhashini")
    monkeypatch.setattr(settings, "tts_service_provider", "Bhashini")
    monkeypatch.setattr(settings, "stt_service_provider", "Bhashini")
    manager_module._manager = None

    mgr = LanguageManager()

    assert isinstance(mgr._detection_provider, GoogleLanguageDetectionProvider)
    assert isinstance(mgr._translation_provider, BhashiniTranslationProvider)
    assert isinstance(mgr._tts_provider, BhashiniTTSProvider)
    assert isinstance(mgr._stt_provider, BhashiniSTTProvider)


@pytest.mark.asyncio
async def test_manager_instantiates_sarvam_providers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "language_detection_service_provider", "Sarvam")
    monkeypatch.setattr(settings, "language_translation_service_provider", "Sarvam")
    monkeypatch.setattr(settings, "tts_service_provider", "Sarvam")
    manager_module._manager = None

    mgr = LanguageManager()

    assert isinstance(mgr._detection_provider, SarvamLanguageDetectionProvider)
    assert isinstance(mgr._translation_provider, SarvamTranslationProvider)
    assert isinstance(mgr._tts_provider, SarvamTTSProvider)


@pytest.mark.asyncio
async def test_googletrans_detection_success(monkeypatch: pytest.MonkeyPatch) -> None:
    class MockDetectorResponse:
        def __init__(self) -> None:
            self.lang = "hi"

    mock_translator_instance = MagicMock()
    # googletrans 4.0.2 Translator methods are async
    mock_translator_instance.detect = AsyncMock(return_value=MockDetectorResponse())

    monkeypatch.setattr(
        "app.languages.google.Translator", lambda: mock_translator_instance
    )

    provider = GoogleLanguageDetectionProvider()
    lang = await provider.detect_language("नमस्ते")
    assert lang == "hi"
    mock_translator_instance.detect.assert_called_once_with("नमस्ते")


@pytest.mark.asyncio
async def test_googletrans_translation_success(monkeypatch: pytest.MonkeyPatch) -> None:
    class MockTranslatorResponse:
        def __init__(self) -> None:
            self.text = "Hello"

    mock_translator_instance = MagicMock()
    mock_translator_instance.translate = AsyncMock(
        return_value=MockTranslatorResponse()
    )

    monkeypatch.setattr(
        "app.languages.google.Translator", lambda: mock_translator_instance
    )

    provider = GoogleTranslationProvider()
    res = await provider.translate("नमस्ते", "hi", "en")
    assert res == "Hello"
    mock_translator_instance.translate.assert_called_once_with(
        "नमस्ते", dest="en", src="hi"
    )


@pytest.mark.asyncio
async def test_bhashini_translation_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BHASHINI_API_KEY", "mock_key")
    monkeypatch.setenv("BHASHINI_ENDPOINT_URL", "https://mock.bhashini.gov.in")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "pipelineResponse": [{"output": [{"target": "Hello"}]}]
    }

    mock_post = MagicMock(return_value=mock_response)
    monkeypatch.setattr("requests.post", mock_post)

    provider = BhashiniTranslationProvider()
    res = await provider.translate("नमस्ते", "hi", "en")

    assert res == "Hello"
    assert mock_post.called


class MockSarvamResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self._payload


class MockSarvamAsyncClient:
    calls: list[dict[str, object]] = []
    response_payload: dict[str, object] = {}

    def __init__(self, timeout: float) -> None:
        self.timeout = timeout

    async def __aenter__(self) -> MockSarvamAsyncClient:
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def post(
        self, url: str, headers: dict[str, str], json: dict[str, object]
    ) -> MockSarvamResponse:
        self.calls.append({"url": url, "headers": headers, "json": json})
        return MockSarvamResponse(self.response_payload)


@pytest.fixture
def mock_sarvam_client(monkeypatch: pytest.MonkeyPatch) -> type[MockSarvamAsyncClient]:
    MockSarvamAsyncClient.calls = []
    MockSarvamAsyncClient.response_payload = {}
    monkeypatch.setattr("app.languages.sarvam.httpx.AsyncClient", MockSarvamAsyncClient)
    return MockSarvamAsyncClient


@pytest.mark.asyncio
async def test_sarvam_translation_success(
    monkeypatch: pytest.MonkeyPatch,
    mock_sarvam_client: type[MockSarvamAsyncClient],
) -> None:
    monkeypatch.setenv("SARVAM_API_KEY", "mock_sarvam_key")
    monkeypatch.setenv("SARVAM_BASE_URL", "https://mock.sarvam.ai")
    get_settings.cache_clear()
    mock_sarvam_client.response_payload = {"translated_text": "Hello"}

    provider = SarvamTranslationProvider()
    result = await provider.translate("नमस्ते", "hi", "en")

    assert result == "Hello"
    assert mock_sarvam_client.calls[0]["url"] == "https://mock.sarvam.ai/translate"
    assert mock_sarvam_client.calls[0]["headers"] == {
        "api-subscription-key": "mock_sarvam_key",
        "Content-Type": "application/json",
    }
    assert mock_sarvam_client.calls[0]["json"] == {
        "input": "नमस्ते",
        "source_language_code": "hi-IN",
        "target_language_code": "en-IN",
        "mode": "formal",
        "model": "sarvam-translate:v1",
        "numerals_format": "international",
    }


@pytest.mark.asyncio
async def test_sarvam_language_detection_maps_bcp47_to_app_code(
    monkeypatch: pytest.MonkeyPatch,
    mock_sarvam_client: type[MockSarvamAsyncClient],
) -> None:
    monkeypatch.setenv("SARVAM_API_KEY", "mock_sarvam_key")
    get_settings.cache_clear()
    mock_sarvam_client.response_payload = {
        "language_code": "hi-IN",
        "script_code": "Deva",
    }

    provider = SarvamLanguageDetectionProvider()
    result = await provider.detect_language("यह हिंदी है।")

    assert result == "hi"
    assert mock_sarvam_client.calls[0]["url"] == "https://api.sarvam.ai/text-lid"
    assert mock_sarvam_client.calls[0]["json"] == {"input": "यह हिंदी है।"}


@pytest.mark.asyncio
async def test_sarvam_tts_decodes_audio(
    monkeypatch: pytest.MonkeyPatch,
    mock_sarvam_client: type[MockSarvamAsyncClient],
) -> None:
    monkeypatch.setenv("SARVAM_API_KEY", "mock_sarvam_key")
    get_settings.cache_clear()
    audio_bytes = b"fake-mp3"
    mock_sarvam_client.response_payload = {
        "audios": [base64.b64encode(audio_bytes).decode("ascii")]
    }

    provider = SarvamTTSProvider()
    result = await provider.text_to_speech("Hello", "en", "female")

    assert result == audio_bytes
    assert mock_sarvam_client.calls[0]["url"] == "https://api.sarvam.ai/text-to-speech"
    assert mock_sarvam_client.calls[0]["json"] == {
        "text": "Hello",
        "target_language_code": "en-IN",
        "speaker": "shubh",
        "pace": 1.0,
        "speech_sample_rate": 24000,
        "model": "bulbul:v3",
        "output_audio_codec": "mp3",
        "temperature": 0.6,
    }


@pytest.mark.asyncio
async def test_utils_incoming_outgoing_routing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Setup mock manager that translates successfully
    mock_mgr = MagicMock()
    mock_mgr.translate = AsyncMock(
        side_effect=lambda text, src, dest: f"translated_{text}"
    )

    monkeypatch.setattr(lang_utils, "get_language_manager", lambda: mock_mgr)

    # Test incoming text translation
    res_in = await lang_utils.process_incoming_text("नमस्ते", "hi")
    assert res_in == "translated_नमस्ते"
    mock_mgr.translate.assert_any_call("नमस्ते", "hi", "en")

    # Test outgoing text translation
    res_out = await lang_utils.process_outgoing_text("Hello", "hi")
    assert res_out == "translated_Hello"
    mock_mgr.translate.assert_any_call("Hello", "en", "hi")


@pytest.mark.asyncio
async def test_utils_fallbacks_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    # Disable features
    settings = get_settings()
    monkeypatch.setattr(settings, "language_translation_service_provider", None)
    manager_module._manager = None

    # Process text should just return original text without raising errors
    assert await lang_utils.process_incoming_text("नमस्ते", "hi") == "नमस्ते"
    assert await lang_utils.process_outgoing_text("Hello", "hi") == "Hello"
