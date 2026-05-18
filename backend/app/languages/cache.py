from __future__ import annotations

import hashlib
import logging

import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None


def get_redis_client() -> aioredis.Redis:
    """Helper function to retrieve or create the global async Redis client instance."""
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        # Splitting password out of the logs to be secure
        host_info = settings.redis_url.split("@")[-1]
        logger.info(f"Initializing async Redis client with endpoint: {host_info}")
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
    return _redis_client


def _get_cache_key(text: str, source: str, destination: str) -> str:
    """Generates a unique, collision-free SHA-256 hashed cache key for translations."""
    text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"translation:{source}:{destination}:{text_hash}"


async def get_cached_translation(
    text: str, source: str, destination: str
) -> str | None:
    """Retrieves a cached translation from Redis. Fails silently if Redis is unreachable."""
    if not text or not text.strip():
        return None
    try:
        client = get_redis_client()
        key = _get_cache_key(text, source, destination)
        translated = await client.get(key)
        if translated:
            logger.debug(f"Translation cache hit for key: {key[:25]}...")
            return str(translated)
    except Exception as e:
        logger.warning(f"Failed to fetch translation from Redis cache: {e}")
    return None


async def set_cached_translation(
    text: str,
    source: str,
    destination: str,
    translated_text: str,
    ttl_seconds: int = 86400,
) -> None:
    """Writes a translated string into Redis cache with a specified TTL. Fails silently."""
    if (
        not text
        or not text.strip()
        or not translated_text
        or not translated_text.strip()
    ):
        return
    try:
        client = get_redis_client()
        key = _get_cache_key(text, source, destination)
        await client.set(key, translated_text, ex=ttl_seconds)
        logger.debug(
            f"Successfully cached translation for key: {key[:25]}... with TTL={ttl_seconds}s"
        )
    except Exception as e:
        logger.warning(f"Failed to write translation to Redis cache: {e}")
