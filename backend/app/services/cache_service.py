"""
cache_service.py — Redis caching utilities
ถ้า Redis ไม่พร้อม จะ fallback เงียบๆ โดยไม่ทำให้ระบบพัง
"""
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from ..config import settings

logger = logging.getLogger("planeat.cache")

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis | None:
    global _redis
    if _redis is None:
        try:
            _redis = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
            )
            await _redis.ping()
            logger.info("Redis connected: %s", settings.redis_url)
        except Exception as e:
            logger.warning("Redis unavailable (%s) — caching disabled", e)
            _redis = None
    return _redis


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    if not r:
        return None
    try:
        val = await r.get(key)
        return json.loads(val) if val is not None else None
    except Exception as e:
        logger.debug("cache_get error key=%s: %s", key, e)
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    """บันทึกค่าลง Redis พร้อม TTL (วินาที)"""
    r = await get_redis()
    if not r:
        return
    try:
        await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.debug("cache_set error key=%s: %s", key, e)


async def cache_delete(key: str) -> None:
    r = await get_redis()
    if not r:
        return
    try:
        await r.delete(key)
    except Exception as e:
        logger.debug("cache_delete error key=%s: %s", key, e)


async def cache_delete_pattern(pattern: str) -> None:
    """ลบ key ทุกตัวที่ตรง pattern เช่น 'categories:*'"""
    r = await get_redis()
    if not r:
        return
    try:
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
    except Exception as e:
        logger.debug("cache_delete_pattern error pattern=%s: %s", pattern, e)
