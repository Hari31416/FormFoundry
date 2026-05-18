from __future__ import annotations

import pytest

from app.languages.cache import get_cached_translation, set_cached_translation


class MockRedis:
    """Mock class simulating an asynchronous Redis client."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.store[key] = value


@pytest.mark.asyncio
async def test_translation_caching_success(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_redis = MockRedis()
    monkeypatch.setattr("app.languages.cache.get_redis_client", lambda: mock_redis)

    # Cache should be empty initially
    val = await get_cached_translation("Hello", "en", "hi")
    assert val is None

    # Set translation in cache
    await set_cached_translation("Hello", "en", "hi", "नमस्ते")

    # Retrieve from cache
    val2 = await get_cached_translation("Hello", "en", "hi")
    assert val2 == "नमस्ते"


@pytest.mark.asyncio
async def test_translation_caching_resiliency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # If redis client raised an exception (e.g. server offline), operations must fail silently
    def raise_error() -> MockRedis:
        raise ConnectionError("Redis server is down")

    monkeypatch.setattr("app.languages.cache.get_redis_client", raise_error)

    # These should complete safely without raising exceptions
    val = await get_cached_translation("Hello", "en", "hi")
    assert val is None

    await set_cached_translation("Hello", "en", "hi", "नमस्ते")
