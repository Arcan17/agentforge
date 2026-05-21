"""SSE streaming endpoint — streams real-time agent events for a task."""

import json

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from app.core.auth import require_api_key
from app.services.stream_service import create_queue, stream_events

router = APIRouter(prefix="/tasks", tags=["stream"])


@router.get("/{task_id}/stream", dependencies=[Depends(require_api_key)])
async def stream_task_events(task_id: str) -> EventSourceResponse:
    """Stream live SSE events for a running task.

    Events:
    - ``agent_start``  — an agent node began executing
    - ``agent_complete`` — an agent node finished
    - ``agent_error`` — an agent node failed (with retry info)
    - ``awaiting_approval`` — human-in-the-loop gate reached
    - ``task_complete`` — task finished successfully
    - ``task_failed`` — task failed with error
    """
    # Ensure queue exists (client may connect before task starts)
    if not stream_events.__module__:  # pragma: no cover
        create_queue(task_id)

    async def event_generator():
        async for event in stream_events(task_id):
            yield {
                "event": event["event"],
                "data": json.dumps(event["data"]),
            }

    return EventSourceResponse(event_generator())
