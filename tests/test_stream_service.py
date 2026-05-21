"""Tests for the SSE stream service — pure asyncio, no HTTP."""



from app.services import stream_service
from app.services.stream_service import (
    close_queue,
    create_queue,
    get_queue,
    publish,
    stream_events,
)


async def test_create_queue_returns_queue():
    q = create_queue("task-001")
    assert q is not None
    assert get_queue("task-001") is q
    # Cleanup
    stream_service._queues.pop("task-001", None)


async def test_get_queue_missing_returns_none():
    assert get_queue("task-nonexistent") is None


async def test_publish_event_lands_in_queue():
    task_id = "task-pub-001"
    create_queue(task_id)

    await publish(task_id, "agent_start", {"agent": "planner", "step": 1})

    q = get_queue(task_id)
    assert q is not None
    item = q.get_nowait()
    assert item["event"] == "agent_start"
    assert item["data"]["agent"] == "planner"
    assert "timestamp" in item["data"]

    stream_service._queues.pop(task_id, None)


async def test_publish_to_missing_queue_is_silently_ignored():
    """Publishing to a task with no queue must not raise."""
    await publish("task-no-queue", "agent_start", {"agent": "planner"})  # no exception


async def test_close_queue_puts_sentinel():
    task_id = "task-close-001"
    create_queue(task_id)

    await close_queue(task_id)

    # After close, stream_events should finish immediately
    events = []
    async for event in stream_events(task_id):
        events.append(event)

    # queue was already removed by stream_events cleanup
    assert events == []


async def test_stream_events_yields_events_then_stops():
    task_id = "task-stream-001"
    create_queue(task_id)

    await publish(task_id, "agent_start", {"agent": "planner"})
    await publish(task_id, "agent_complete", {"agent": "planner"})
    await close_queue(task_id)

    events = []
    async for event in stream_events(task_id):
        events.append(event)

    assert len(events) == 2
    assert events[0]["event"] == "agent_start"
    assert events[1]["event"] == "agent_complete"


async def test_stream_events_stops_on_sentinel():
    task_id = "task-sentinel-001"
    create_queue(task_id)

    await publish(task_id, "task_complete", {"status": "complete"})
    await close_queue(task_id)

    received = []
    async for ev in stream_events(task_id):
        received.append(ev)

    # Only the real event, not the sentinel
    assert len(received) == 1
    assert received[0]["event"] == "task_complete"


async def test_publish_queue_full_does_not_raise():
    """Filling the queue past maxsize should silently drop messages."""
    task_id = "task-full-001"
    create_queue(task_id)

    # Fill queue to capacity (maxsize=200)
    for i in range(200):
        await publish(task_id, "agent_start", {"step": i})

    # This 201st publish should be silently dropped, not raise
    await publish(task_id, "overflow", {"step": 201})

    stream_service._queues.pop(task_id, None)


async def test_publish_event_contains_timestamp():
    task_id = "task-ts-001"
    create_queue(task_id)
    await publish(task_id, "test_event", {"key": "value"})

    q = get_queue(task_id)
    item = q.get_nowait()
    assert "timestamp" in item["data"]
    # Timestamp should be ISO format
    assert "T" in item["data"]["timestamp"]

    stream_service._queues.pop(task_id, None)
