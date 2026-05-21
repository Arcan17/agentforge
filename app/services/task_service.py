"""Task service — orchestrates graph execution, persistence, and SSE publishing."""

import asyncio
import time
import uuid
from datetime import UTC, datetime

from langgraph.types import Command
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import get_graph
from app.agents.state import AgentState
from app.core.config import settings
from app.core.constants import (
    EVENT_AGENT_COMPLETE,
    EVENT_AGENT_START,
    EVENT_AWAITING_APPROVAL,
    EVENT_TASK_COMPLETE,
    EVENT_TASK_FAILED,
    STATUS_AWAITING_APPROVAL,
    STATUS_COMPLETE,
    STATUS_FAILED,
    STATUS_PENDING,
    STEP_COMPLETED,
)
from app.core.logging import get_logger
from app.models.agent_event import AgentEvent
from app.models.agent_step import AgentStep
from app.models.database import AsyncSessionLocal
from app.models.task_run import TaskRun
from app.services.stream_service import close_queue, create_queue, publish

logger = get_logger(__name__)

# task_id → asyncio.Task (background execution)
_running_tasks: dict[str, asyncio.Task] = {}

# task_id → human approval future (set when task is awaiting_approval)
_approval_futures: dict[str, asyncio.Future] = {}


# ─── Public API ──────────────────────────────────────────────────────────────

async def create_task(
    db: AsyncSession,
    original_task: str,
    human_in_loop: bool | None = None,
) -> TaskRun:
    """Create a TaskRun record and launch graph execution in the background."""
    task_id = str(uuid.uuid4())
    hil = human_in_loop if human_in_loop is not None else settings.human_in_loop

    run = TaskRun(
        id=uuid.UUID(task_id),
        original_task=original_task,
        status=STATUS_PENDING,
        human_in_loop=hil,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Create SSE queue before launching background task
    create_queue(task_id)

    # Launch background task
    bg_task = asyncio.create_task(_run_graph(task_id, original_task, hil))
    _running_tasks[task_id] = bg_task

    logger.info("task_created", task_id=task_id, human_in_loop=hil)
    return run


async def get_task(db: AsyncSession, task_id: str) -> TaskRun | None:
    """Fetch a TaskRun by id."""
    from sqlalchemy import select  # noqa: PLC0415

    return await db.scalar(
        select(TaskRun).where(TaskRun.id == uuid.UUID(task_id))
    )


async def approve_task(task_id: str, decision: str, feedback: str | None = None) -> bool:
    """Resume a paused graph with a human decision.

    Returns True if the task was awaiting approval, False otherwise.
    """
    future = _approval_futures.get(task_id)
    if future is None or future.done():
        logger.warning("approve_task_no_future", task_id=task_id)
        return False

    result = {"decision": decision}
    if feedback:
        result["feedback"] = feedback
    future.set_result(result)
    logger.info("task_approved", task_id=task_id, decision=decision)
    return True


# ─── Background execution ────────────────────────────────────────────────────

async def _run_graph(task_id: str, original_task: str, human_in_loop: bool) -> None:
    """Run the LangGraph graph as a background asyncio task."""
    t0 = time.monotonic()
    graph = get_graph()
    config = {"configurable": {"thread_id": task_id}}

    initial_state: AgentState = {
        "task_id": task_id,
        "original_task": original_task,
        "subtasks": [],
        "research_results": [],
        "analysis": "",
        "critic_score": 0.0,
        "critic_feedback": "",
        "critic_approved": False,
        "revision_count": 0,
        "human_in_loop": human_in_loop,
        "human_decision": None,
        "human_feedback": None,
        "final_report": None,
        "status": STATUS_PENDING,
        "active_agent": "",
        "tokens_used": 0,
        "errors": [],
        "messages": [],
    }

    step_number = 0

    try:
        input_or_command = initial_state
        while True:
            interrupt_value = None
            async for event in graph.astream(
                input_or_command, config=config, stream_mode="updates"
            ):
                for node_name, node_output in event.items():
                    if node_name == "__interrupt__":
                        # Graph paused — awaiting human input
                        interrupt_value = node_output
                        break

                    step_number += 1

                    # Publish SSE events
                    await publish(
                        task_id,
                        EVENT_AGENT_START,
                        {"agent": node_name, "step": step_number},
                    )

                    # Persist agent step
                    await _persist_step(
                        task_id=task_id,
                        agent_name=node_name,
                        step_number=step_number,
                        status=STEP_COMPLETED,
                        output_data=_safe_dict(node_output),
                    )

                    # Update task_run status
                    await _update_task_status(
                        task_id=task_id,
                        status=node_output.get("status", ""),
                        tokens_used=node_output.get("tokens_used", 0),
                        critic_score=node_output.get("critic_score"),
                        revision_count=node_output.get("revision_count"),
                    )

                    await publish(
                        task_id,
                        EVENT_AGENT_COMPLETE,
                        {
                            "agent": node_name,
                            "step": step_number,
                            "tokens": node_output.get("tokens_used", 0),
                            "status": node_output.get("status", ""),
                        },
                    )

                if interrupt_value is not None:
                    break  # exit inner astream loop

            if interrupt_value is not None:
                # Update DB to awaiting_approval
                await _update_task_status(task_id=task_id, status=STATUS_AWAITING_APPROVAL)

                # Emit SSE event
                interrupt_data = interrupt_value[0].value if interrupt_value else {}
                await publish(task_id, EVENT_AWAITING_APPROVAL, interrupt_data)

                # Create a future and wait for human to call approve_task()
                loop = asyncio.get_event_loop()
                future: asyncio.Future = loop.create_future()
                _approval_futures[task_id] = future

                try:
                    decision = await asyncio.wait_for(
                        asyncio.shield(future), timeout=3600.0  # 1h timeout
                    )
                except TimeoutError:
                    logger.warning("human_gate_timeout", task_id=task_id)
                    decision = {"decision": "approve"}
                finally:
                    _approval_futures.pop(task_id, None)

                # Resume graph with human decision
                input_or_command = Command(resume=decision)
            else:
                break  # Graph completed normally

        # Graph finished — fetch final state
        final_state = graph.get_state(config)
        values = final_state.values if final_state else {}

        total_duration_ms = int((time.monotonic() - t0) * 1000)
        final_status = values.get("status", STATUS_COMPLETE)
        final_report = values.get("final_report")
        total_tokens = values.get("tokens_used", 0)

        await _finalize_task(
            task_id=task_id,
            status=final_status,
            final_report=final_report,
            total_tokens=total_tokens,
            total_duration_ms=total_duration_ms,
        )

        await publish(
            task_id,
            EVENT_TASK_COMPLETE,
            {
                "task_id": task_id,
                "status": final_status,
                "total_tokens": total_tokens,
                "duration_ms": total_duration_ms,
            },
        )

    except Exception as exc:
        logger.error("graph_execution_failed", task_id=task_id, error=str(exc))
        await _finalize_task(
            task_id=task_id,
            status=STATUS_FAILED,
            error=str(exc),
            total_duration_ms=int((time.monotonic() - t0) * 1000),
        )
        await publish(task_id, EVENT_TASK_FAILED, {"task_id": task_id, "error": str(exc)})
    finally:
        await close_queue(task_id)
        _running_tasks.pop(task_id, None)


# ─── Persistence helpers ──────────────────────────────────────────────────────

async def _persist_step(
    task_id: str,
    agent_name: str,
    step_number: int,
    status: str,
    output_data: dict | None = None,
    error: str | None = None,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            step = AgentStep(
                task_id=uuid.UUID(task_id),
                agent_name=agent_name,
                step_number=step_number,
                status=status,
                output_summary=(str(output_data.get("status", ""))[:200] if output_data else None),
                output_data=output_data,
                error=error,
            )
            db.add(step)
            await db.commit()
    except Exception as exc:
        logger.warning("persist_step_failed", task_id=task_id, error=str(exc))


async def _persist_event(task_id: str, event_type: str, agent_name: str | None, data: dict) -> None:
    try:
        async with AsyncSessionLocal() as db:
            event = AgentEvent(
                task_id=uuid.UUID(task_id),
                event_type=event_type,
                agent_name=agent_name,
                data=data,
            )
            db.add(event)
            await db.commit()
    except Exception as exc:
        logger.warning("persist_event_failed", task_id=task_id, error=str(exc))


async def _update_task_status(
    task_id: str,
    status: str,
    tokens_used: int = 0,
    critic_score: float | None = None,
    revision_count: int | None = None,
) -> None:
    if not status:
        return
    try:
        from sqlalchemy import select  # noqa: PLC0415

        async with AsyncSessionLocal() as db:
            run = await db.scalar(select(TaskRun).where(TaskRun.id == uuid.UUID(task_id)))
            if run:
                run.status = status
                run.updated_at = datetime.now(UTC)
                if tokens_used:
                    run.total_tokens = tokens_used
                if critic_score is not None:
                    run.critic_score = critic_score
                if revision_count is not None:
                    run.revision_count = revision_count
                await db.commit()
    except Exception as exc:
        logger.warning("update_task_status_failed", task_id=task_id, error=str(exc))


async def _finalize_task(
    task_id: str,
    status: str,
    final_report: str | None = None,
    error: str | None = None,
    total_tokens: int = 0,
    total_duration_ms: int = 0,
) -> None:
    try:
        from sqlalchemy import select  # noqa: PLC0415

        async with AsyncSessionLocal() as db:
            run = await db.scalar(select(TaskRun).where(TaskRun.id == uuid.UUID(task_id)))
            if run:
                run.status = status
                run.final_report = final_report
                run.error = error
                run.total_tokens = total_tokens
                run.total_duration_ms = total_duration_ms
                run.updated_at = datetime.now(UTC)
                await db.commit()
    except Exception as exc:
        logger.warning("finalize_task_failed", task_id=task_id, error=str(exc))


def _safe_dict(value: object) -> dict:
    """Safely convert node output to a JSON-serializable dict."""
    if isinstance(value, dict):
        result = {}
        for k, v in value.items():
            if k == "messages":
                result[k] = [str(m) for m in (v or [])]
            elif isinstance(v, list) and v and hasattr(v[0], "__dict__"):
                result[k] = [str(i) for i in v]
            else:
                result[k] = v
        return result
    return {}
