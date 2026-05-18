from __future__ import annotations

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
    # Clear any active configurations to test absolute disabled behavior
    monkeypatch.delenv("LANGUAGE_DETECTION_SERVICE_PROVIDER", raising=False)
    monkeypatch.delenv("LANGUAGE_TRANSLATION_SERVICE_PROVIDER", raising=False)
    monkeypatch.delenv("TTS_SERVICE_PROVIDER", raising=False)
    monkeypatch.delenv("STT_SERVICE_PROVIDER", raising=False)

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
    monkeypatch.setenv("LANGUAGE_DETECTION_SERVICE_PROVIDER", "langdetect")

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
    monkeypatch.setenv("LANGUAGE_DETECTION_SERVICE_PROVIDER", "Google")
    monkeypatch.setenv("LANGUAGE_TRANSLATION_SERVICE_PROVIDER", "Bhashini")
    monkeypatch.setenv("TTS_SERVICE_PROVIDER", "Bhashini")
    monkeypatch.setenv("STT_SERVICE_PROVIDER", "Bhashini")

    mgr = LanguageManager()

    assert isinstance(mgr._detection_provider, GoogleLanguageDetectionProvider)
    assert isinstance(mgr._translation_provider, BhashiniTranslationProvider)
    assert isinstance(mgr._tts_provider, BhashiniTTSProvider)
    assert isinstance(mgr._stt_provider, BhashiniSTTProvider)


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
    monkeypatch.delenv("LANGUAGE_TRANSLATION_SERVICE_PROVIDER", raising=False)

    # Process text should just return original text without raising errors
    assert await lang_utils.process_incoming_text("नमस्ते", "hi") == "नमस्ते"
    assert await lang_utils.process_outgoing_text("Hello", "hi") == "Hello"
