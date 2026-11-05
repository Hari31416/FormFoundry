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


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "translation-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_conversation_turn_routes_translation_and_persists_lang(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 1. Mock translation and language detection
    mock_manager = MagicMock(close=AsyncMock())
    mock_manager.is_detection_enabled = True
    mock_manager.is_translation_enabled = True

    # Simulate: User inputs Hindi -> Detected as "hi" -> Translated to English name Priya Sharma
    mock_manager.detect_language = AsyncMock(return_value="hi")

    async def mock_translate(text: str, source: str, destination: str) -> str:
        if source == "hi" and destination == "en":
            return (
                "My name is Priya Sharma. Phone number is 9876543210. "
                "I live at 14 Residency Road, Bengaluru."
            )
        if source == "en" and destination == "hi":
            return "नमस्ते प्रिय शर्मा"  # Translated next question
        return text

    mock_manager.translate = AsyncMock(side_effect=mock_translate)

    # Apply the mock manager singleton via global _manager
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    # Shield Redis from real connections during integration test
    class MockRedis:
        async def get(self, key: str) -> str | None:
            return None

        async def set(self, key: str, value: str, ex: int | None = None) -> None:
            pass

    monkeypatch.setattr("app.languages.cache.get_redis_client", lambda: MockRedis())

    case_id = create_case(client)

    # 2. Submit conversation turn in Hindi (without explicit language selection)
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": """मेरा नाम प्रिया शर्मा है। फोन नंबर 9876543210 है।
            मैं 14 रेजीडेंसी रोड, बेंगलुरु में रहती हूँ।""",
            "created_by": "translation-test",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    # User turn message in database keeps the original message!
    assert payload["user_turn"]["message"] == (
        "मेरा नाम प्रिया शर्मा है। फोन नंबर 9876543210 है।\n"
        "            मैं 14 रेजीडेंसी रोड, बेंगलुरु में रहती हूँ।"
    )
    assert payload["user_turn"]["metadata"]["detected_language"] == "hi"
    assert "Priya Sharma" in payload["user_turn"]["metadata"]["english_translation"]

    # Assistant turn message is translated back to Hindi!
    assert payload["assistant_turn"]["message"] == "नमस्ते प्रिय शर्मा"
    assert payload["assistant_turn"]["metadata"]["original_english"] is not None

    # Preferred language is persisted to case record metadata
    case_response = client.get(f"/api/v1/cases/{case_id}")
    assert case_response.status_code == 200
    assert case_response.json()["metadata"]["preferred_language"] == "hi"


def test_conversation_turn_respects_explicit_language(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 1. Mock translation and language detection
    mock_manager = MagicMock(close=AsyncMock())
    mock_manager.is_detection_enabled = True
    mock_manager.is_translation_enabled = True

    # Detect language would return something else, but we will override explicitly
    mock_manager.detect_language = AsyncMock(return_value="en")

    async def mock_translate(text: str, source: str, destination: str) -> str:
        if source == "mr" and destination == "en":
            return (
                "My name is Priya Sharma. Phone number is 9876543210. "
                "I live at 14 Residency Road, Bengaluru."
            )
        if source == "en" and destination == "mr":
            return "नमस्ते मराठी"
        return text

    mock_manager.translate = AsyncMock(side_effect=mock_translate)

    # Apply the mock manager singleton via global _manager
    monkeypatch.setattr(manager_module, "_manager", mock_manager)

    # Shield Redis from real connections during integration test
    class MockRedis:
        async def get(self, key: str) -> str | None:
            return None

        async def set(self, key: str, value: str, ex: int | None = None) -> None:
            pass

    monkeypatch.setattr("app.languages.cache.get_redis_client", lambda: MockRedis())

    case_id = create_case(client)

    # 2. Submit conversation turn in Marathi explicitly
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": "माझे नाव प्रिया शर्मा आहे.",
            "created_by": "translation-test",
            "language": "mr",  # Explicit language override!
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["user_turn"]["metadata"]["detected_language"] == "mr"
    assert payload["assistant_turn"]["message"] == "नमस्ते मराठी"

    # Preferred language is persisted to case record
    case_response = client.get(f"/api/v1/cases/{case_id}")
    assert case_response.status_code == 200
    assert case_response.json()["metadata"]["preferred_language"] == "mr"
