"""SSE stream service — manages per-task asyncio queues for real-time event streaming."""

import asyncio
from datetime import UTC, datetime
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

# task_id → Queue of event dicts
_queues: dict[str, asyncio.Queue] = {}

_SENTINEL = object()  # marks stream end


def create_queue(task_id: str) -> asyncio.Queue:
    """Create (or reset) the event queue for a task."""
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    _queues[task_id] = q
    return q


def get_queue(task_id: str) -> asyncio.Queue | None:
    """Return the existing queue for a task, if any."""
    return _queues.get(task_id)


async def publish(task_id: str, event_type: str, data: dict[str, Any]) -> None:
    """Publish an event to the task's SSE queue."""
    q = _queues.get(task_id)
    if q is None:
        return
    event = {
        "event": event_type,
        "data": {**data, "timestamp": datetime.now(UTC).isoformat()},
    }
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        logger.warning("stream_queue_full", task_id=task_id, dropped_event=event_type)


async def close_queue(task_id: str) -> None:
    """Signal end-of-stream and remove the queue."""
    q = _queues.get(task_id)
    if q:
        try:
            q.put_nowait(_SENTINEL)
        except asyncio.QueueFull:
            pass


async def stream_events(task_id: str, timeout: float = 300.0):
    """Async generator — yields event dicts until sentinel or timeout."""
    q = _queues.get(task_id)
    if q is None:
        return
    try:
        while True:
            try:
                item = await asyncio.wait_for(q.get(), timeout=timeout)
                if item is _SENTINEL:
                    break
                yield item
            except TimeoutError:
                logger.info("stream_timeout", task_id=task_id)
                break
    finally:
        # Clean up when client disconnects
        _queues.pop(task_id, None)
