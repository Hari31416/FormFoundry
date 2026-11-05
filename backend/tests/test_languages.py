from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from indic_language_utils import Settings
from indic_language_utils.errors import LanguageUtilsError

import app.languages.manager as manager_module
import app.languages.utils as lang_utils
from app.languages.manager import LanguageManager


@pytest.fixture
def manager(monkeypatch: pytest.MonkeyPatch) -> LanguageManager:
    settings = Settings.load(
        path=manager_module.REPOSITORY_ROOT / ".indic-language-utils.toml", env={}
    )
    monkeypatch.setattr(manager_module, "load_indic_settings", lambda: (settings, {}))
    monkeypatch.setattr(
        manager_module, "get_cached_translation", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(manager_module, "set_cached_translation", AsyncMock())
    return LanguageManager()


def fake_client(**methods: object) -> MagicMock:
    client = MagicMock(**methods)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    return client


async def test_default_clients_open_without_cloud_credentials(
    manager: LanguageManager,
) -> None:
    assert manager.settings.routes["translation"] == ("googletrans",)
    assert manager.settings.routes["text_language_detection"] == ("fasttext",)
    assert manager.settings.routes["text_to_speech"] == ("edge_tts",)
    await manager.start()
    assert manager._detection is not None
    assert manager._translation is not None
    assert manager._tts is not None
    await manager.close()
    assert not manager._started


async def test_clients_reused_and_closed(
    manager: LanguageManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    clients = [fake_client() for _ in range(3)]
    for name, client in zip(("detection", "translation", "tts"), clients, strict=True):
        factory = MagicMock(return_value=client)
        monkeypatch.setattr(manager_module, f"get_{name}_client", factory)
    await manager.start()
    await manager.start()
    for client in clients:
        client.__aenter__.assert_awaited_once()
    await manager.close()
    for client in clients:
        client.__aexit__.assert_awaited_once()


async def test_partial_startup_closes_clients(
    manager: LanguageManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    detection = fake_client()
    monkeypatch.setattr(
        manager_module, "get_detection_client", lambda *a, **k: detection
    )
    monkeypatch.setattr(
        manager_module,
        "get_translation_client",
        MagicMock(side_effect=ValueError("bad config")),
    )
    with pytest.raises(ValueError):
        await manager.start()
    detection.__aexit__.assert_awaited_once()
    assert not manager._started


async def test_disabled_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(manager_module, "load_indic_settings", lambda: (Settings(), {}))
    manager = LanguageManager()
    assert not manager.is_detection_enabled
    assert not manager.is_translation_enabled
    assert not manager.is_tts_enabled
    assert await manager.detect_language("नमस्ते") == "en"
    assert await manager.translate("Hello", "en", "hi") == "Hello"
    assert await manager.text_to_speech("Hello", "en") is None
    assert (
        await manager.speech_to_text(
            b"audio", "hi", audio_format="wav", sampling_rate=16000
        )
        == ""
    )
    assert not manager._started


async def test_detection_returns_app_language_code(manager: LanguageManager) -> None:
    manager._started = True
    manager._detection = SimpleNamespace(
        detect=AsyncMock(
            return_value=SimpleNamespace(language=SimpleNamespace(language="hi"))
        )
    )
    assert await manager.detect_language("यह हिंदी है") == "hi"
    manager._detection.detect.side_effect = LanguageUtilsError("unavailable")
    assert await manager.detect_language("यह हिंदी है") == "en"


async def test_translation_normalizes_languages_and_caches_success(
    manager: LanguageManager,
) -> None:
    manager._started = True
    manager._translation = SimpleNamespace(
        translate=AsyncMock(return_value=SimpleNamespace(text="नमस्ते"))
    )
    assert await manager.translate("Hello", "en", "hi") == "नमस्ते"
    manager._translation.translate.assert_awaited_once_with("Hello", "en-IN", "hi-IN")
    manager_module.set_cached_translation.assert_awaited_once_with(
        "Hello", "en-IN", "hi-IN", "नमस्ते"
    )
    assert await manager.translate("Hello", "hi", "hi-IN") == "Hello"


async def test_cached_translation_skips_provider(
    manager: LanguageManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        manager_module, "get_cached_translation", AsyncMock(return_value="नमस्ते")
    )
    assert await manager.translate("Hello", "en", "hi") == "नमस्ते"
    assert not manager._started


@pytest.mark.parametrize(
    "failure", [LanguageUtilsError("unavailable"), ValueError("bad input")]
)
async def test_failed_translation_is_not_cached(
    manager: LanguageManager, failure: Exception
) -> None:
    manager._started = True
    manager._translation = SimpleNamespace(translate=AsyncMock(side_effect=failure))
    with pytest.raises(type(failure)):
        await manager.translate("Hello", "en", "hi")
    manager_module.set_cached_translation.assert_not_awaited()


async def test_empty_translation_is_not_cached(manager: LanguageManager) -> None:
    manager._started = True
    manager._translation = SimpleNamespace(
        translate=AsyncMock(return_value=SimpleNamespace(text="  "))
    )
    with pytest.raises(ValueError, match="empty"):
        await manager.translate("Hello", "en", "hi")
    manager_module.set_cached_translation.assert_not_awaited()


async def test_tts_preserves_audio_and_passes_voice_gender(
    manager: LanguageManager,
) -> None:
    result = SimpleNamespace(audio=b"RIFF-data", audio_format="wav")
    manager._started = True
    manager._tts = SimpleNamespace(synthesize=AsyncMock(return_value=result))
    assert await manager.text_to_speech("Hello", "hi", "male") is result
    call = manager._tts.synthesize.call_args
    assert call.kwargs["language"] == "hi-IN"
    assert call.kwargs["options"].provider_parameters["edge_tts"]["gender"] == "male"
    manager._tts.synthesize.side_effect = LanguageUtilsError("unavailable")
    assert await manager.text_to_speech("Hello", "hi") is None


async def test_blank_inputs_skip_clients(manager: LanguageManager) -> None:
    assert await manager.detect_language("  ") == "en"
    assert await manager.translate("  ", "en", "hi") == "  "
    assert await manager.text_to_speech("  ", "hi") is None
    assert not manager._started


def test_dotenv_and_process_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        manager_module,
        "dotenv_values",
        lambda path: {"SARVAM_API_KEY": "file", "ILU_ROUTE_TRANSLATION": "sarvam"},
    )
    monkeypatch.setenv("SARVAM_API_KEY", "process")
    monkeypatch.setenv("ILU_ROUTE_TRANSLATION", "googletrans")
    settings, env = manager_module.load_indic_settings()
    assert env["SARVAM_API_KEY"] == "process"
    assert settings.routes["translation"] == ("googletrans",)
    monkeypatch.setenv("ILU_ROUTE_TRANSLATION", "")
    settings, _ = manager_module.load_indic_settings()
    assert not settings.routes["translation"]


async def test_utils_incoming_outgoing_routing(monkeypatch: pytest.MonkeyPatch) -> None:
    mock = MagicMock(
        translate=AsyncMock(side_effect=lambda text, src, dest: f"translated_{text}")
    )
    monkeypatch.setattr(lang_utils, "get_language_manager", lambda: mock)
    assert await lang_utils.process_incoming_text("नमस्ते", "hi") == "translated_नमस्ते"
    assert await lang_utils.process_outgoing_text("Hello", "hi") == "translated_Hello"
    mock.translate.side_effect = LanguageUtilsError("unavailable")
    assert await lang_utils.process_incoming_text("नमस्ते", "hi") == "नमस्ते"
    assert await lang_utils.process_outgoing_text("Hello", "hi") == "Hello"


async def test_stt_uses_configured_client_and_actual_audio_format(
    manager: LanguageManager,
) -> None:
    manager.settings = Settings(routes={"speech_to_text": ("bhashini",)})
    manager._started = True
    manager._stt = SimpleNamespace(
        transcribe=AsyncMock(return_value=SimpleNamespace(text="नमस्ते"))
    )
    assert (
        await manager.speech_to_text(
            b"audio", "hi", audio_format="wav", sampling_rate=16000
        )
        == "नमस्ते"
    )
    manager._stt.transcribe.assert_awaited_once_with(
        b"audio", language="hi", audio_format="wav", sampling_rate=16000
    )


async def test_shutdown_closes_manager_and_resets_singleton(
    manager: LanguageManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager.close = AsyncMock()
    monkeypatch.setattr(manager_module, "_manager", manager)
    await manager_module.close_language_manager()
    manager.close.assert_awaited_once()
    assert manager_module._manager is None
