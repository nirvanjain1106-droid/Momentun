import asyncio
import logging
import time
from collections import defaultdict
from typing import AsyncIterator

logger = logging.getLogger(__name__)
MAX_CONNECTIONS_PER_USER = 3

class EventBus:
    """In-memory pub/sub. Single-process only. Swap to Redis Streams in Sprint 6."""

    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._last_active: dict[int, float] = {}

    async def subscribe(self, user_id: str) -> AsyncIterator[dict]:
        """Yield events for a user. Auto-cleanup on disconnect."""
        queues = self._subscribers[user_id]
        if len(queues) >= MAX_CONNECTIONS_PER_USER:
            oldest = queues.pop(0)
            self._last_active.pop(id(oldest), None)
            # Signal eviction to the client
            await oldest.put({"event": "evicted", "data": {"reason": "max_connections_reached"}})
            # Signal termination to the generator
            await oldest.put(None)

        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        queues.append(queue)
        self._last_active[id(queue)] = time.monotonic()

        try:
            while True:
                # v5 B1: try/except INSIDE the loop — generator survives timeouts
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    if event is None:
                        break
                    self._last_active[id(queue)] = time.monotonic()
                    yield event
                except asyncio.TimeoutError:
                    # Heartbeat — keeps the connection alive through proxies (nginx/CF)
                    yield {"event": "ping", "data": {}}
        finally:
            if queue in queues:
                queues.remove(queue)
            self._last_active.pop(id(queue), None)

    async def publish(self, user_id: str, event: dict):
        for queue in self._subscribers.get(user_id, []):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("sse_queue_full", extra={"user_id": user_id})

    def cleanup_stale(self, max_idle_seconds: float = 120.0):
        now = time.monotonic()
        for user_id in list(self._subscribers):
            keep, drop = [], []
            for q in self._subscribers[user_id]:
                if (now - self._last_active.get(id(q), 0)) < max_idle_seconds:
                    keep.append(q)
                else:
                    drop.append(q)
            for q in drop:
                self._last_active.pop(id(q), None)
                try:
                    q.put_nowait(None)
                except asyncio.QueueFull:
                    # Rare, but shouldn't block cleanup
                    pass
            self._subscribers[user_id] = keep

event_bus = EventBus()
