from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.languages.manager as manager_module


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    from app.core.config import get_settings

    get_settings.cache_clear()
    manager_module._manager = None
    yield
    get_settings.cache_clear()
    manager_module._manager = None


def test_detect_language_api_endpoint(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Mock the LanguageManager singleton to verify routing isolation
    mock_manager = MagicMock()
    mock_manager.detect_language = AsyncMock(return_value="hi")
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    response = client.post(
        "/api/v1/languages/detect", json={"text": "मेरा नाम प्रिया शर्मा है।"}
    )

    assert response.status_code == 200
    assert response.json() == {"language": "hi"}
    mock_manager.detect_language.assert_called_once_with("मेरा नाम प्रिया शर्मा है।")


def test_get_languages_config(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_manager = MagicMock()
    mock_manager.is_translation_enabled = True
    mock_manager.is_detection_enabled = True
    mock_manager.is_tts_enabled = True
    mock_manager.is_stt_enabled = False
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    response = client.get("/api/v1/languages/config")

    assert response.status_code == 200
    assert response.json() == {
        "is_translation_enabled": True,
        "is_detection_enabled": True,
        "is_tts_enabled": True,
        "is_stt_enabled": False,
    }


def test_text_to_speech_endpoint_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_manager = MagicMock()
    mock_manager.is_tts_enabled = True
    mock_manager.text_to_speech = AsyncMock(return_value=b"fake-mp3-bytes")
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    response = client.post(
        "/api/v1/languages/tts",
        json={"text": "Hello Priya", "language": "en", "gender": "female"},
    )

    assert response.status_code == 200
    assert response.content == b"fake-mp3-bytes"
    assert response.headers["content-type"] == "audio/mpeg"
    mock_manager.text_to_speech.assert_called_once_with("Hello Priya", "en", "female")


def test_text_to_speech_endpoint_disabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_manager = MagicMock()
    mock_manager.is_tts_enabled = False
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    response = client.post(
        "/api/v1/languages/tts",
        json={"text": "Hello Priya", "language": "en"},
    )

    assert response.status_code == 501
    assert "disabled" in response.json()["detail"]


def test_text_to_speech_endpoint_failed_generation(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_manager = MagicMock()
    mock_manager.is_tts_enabled = True
    mock_manager.text_to_speech = AsyncMock(return_value=None)
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    response = client.post(
        "/api/v1/languages/tts",
        json={"text": "Hello Priya", "language": "en"},
    )

    assert response.status_code == 400
    assert "Failed" in response.json()["detail"]
