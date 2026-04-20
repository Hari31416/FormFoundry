from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

import app.llm.service as llm_service
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_generate_json_logs_skip_when_unconfigured(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_ENABLED", "false")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    caplog.set_level(logging.INFO, logger="app.llm.service")

    payload = await llm_service.generate_json(system_prompt="x", user_prompt="y")

    assert payload is None
    skip_logs = [
        record for record in caplog.records if record.message == "llm.call.skipped"
    ]
    assert skip_logs
    assert skip_logs[0].reason == "llm_not_configured"


@pytest.mark.asyncio
async def test_generate_json_logs_completion_metrics(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_completion(**_: object) -> SimpleNamespace:
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"question":"Please share details."}'
                    )
                )
            ],
            usage=SimpleNamespace(
                prompt_tokens=48,
                completion_tokens=12,
                total_tokens=60,
            ),
        )

    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_API_KEY", "test-api-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setattr(llm_service, "acompletion", fake_completion)

    caplog.set_level(logging.INFO, logger="app.llm.service")
    payload = await llm_service.generate_json(
        system_prompt="system instructions",
        user_prompt="user asks for grouped questions",
    )

    assert payload == {"question": "Please share details."}
    completion_logs = [
        record for record in caplog.records if record.message == "llm.call.completed"
    ]
    assert completion_logs
    assert completion_logs[0].model == "test-model"
    assert completion_logs[0].total_tokens == 60
    assert completion_logs[0].prompt_tokens == 48
    assert completion_logs[0].completion_tokens == 12


@pytest.mark.asyncio
async def test_generate_json_logs_invalid_json_response(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_completion(**_: object) -> SimpleNamespace:
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="{invalid-json"))]
        )

    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_API_KEY", "test-api-key")
    monkeypatch.setattr(llm_service, "acompletion", fake_completion)

    caplog.set_level(logging.INFO, logger="app.llm.service")
    payload = await llm_service.generate_json(
        system_prompt="system instructions",
        user_prompt="user instructions",
    )

    assert payload is None
    invalid_logs = [
        record for record in caplog.records if record.message == "llm.call.invalid_json"
    ]
    assert invalid_logs
    assert invalid_logs[0].response_chars > 0


@pytest.mark.asyncio
async def test_generate_vision_text_sends_image_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_completion(**kwargs: object) -> SimpleNamespace:
        captured.update(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="Detected text"))]
        )

    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_API_KEY", "test-api-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setenv("VISION_MODEL", "test-vision-model")
    monkeypatch.setattr(llm_service, "acompletion", fake_completion)

    payload = await llm_service.generate_vision_text(
        system_prompt="ocr system",
        user_prompt="extract text",
        media=[{"content_type": "image/png", "payload": b"abc"}],
    )

    assert payload == "Detected text"
    assert captured["model"] == "test-vision-model"
    messages = captured["messages"]
    assert isinstance(messages, list)
    user_message = messages[1]
    assert isinstance(user_message, dict)
    content = user_message["content"]
    assert isinstance(content, list)
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
