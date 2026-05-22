"""Task service — creates tasks, manages human approval, and cancels via Celery.

All mutable state lives in the database.  Graph execution is delegated to the
Celery worker (app.workers.graph_worker).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import STATUS_AWAITING_APPROVAL, STATUS_CANCELLED, STATUS_PENDING
from app.core.logging import get_logger
from app.models.database import AsyncSessionLocal
from app.models.task_run import TaskRun
from app.workers.graph_worker import run_graph

logger = get_logger(__name__)

# Statuses that can no longer be cancelled
_TERMINAL_STATUSES = {"complete", "failed", "cancelled", "best_effort"}


# ─── Public API ───────────────────────────────────────────────────────────────

async def create_task(
    db: AsyncSession,
    original_task: str,
    human_in_loop: bool | None = None,
) -> TaskRun:
    """Persist a TaskRun and enqueue a Celery graph-execution task."""
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

    # Enqueue Celery task and store its ID for potential cancellation
    celery_result = run_graph.delay(task_id, original_task, hil)
    run.celery_task_id = celery_result.id
    await db.commit()

    logger.info("task_created", task_id=task_id, human_in_loop=hil, celery_id=celery_result.id)
    return run


async def get_task(db: AsyncSession, task_id: str) -> TaskRun | None:
    """Fetch a TaskRun by id."""
    return await db.scalar(
        select(TaskRun).where(TaskRun.id == uuid.UUID(task_id))
    )


async def approve_task(task_id: str, decision: str, feedback: str | None = None) -> bool:
    """Store the human decision in PostgreSQL so the Celery worker can resume.

    Returns True if the task was in awaiting_approval state, False otherwise.
    """
    task_uuid = uuid.UUID(task_id)

    async with AsyncSessionLocal() as db:
        run = await db.scalar(select(TaskRun).where(TaskRun.id == task_uuid))
        if run is None or run.status != STATUS_AWAITING_APPROVAL:
            logger.warning(
                "approve_task_not_awaiting",
                task_id=task_id,
                status=getattr(run, "status", None),
            )
            return False

        run.human_decision = decision
        run.human_feedback = feedback
        await db.commit()

    logger.info("task_approved", task_id=task_id, decision=decision)
    return True


async def cancel_task(task_id: str) -> bool:
    """Cancel a running task by revoking its Celery job and marking it cancelled.

    Returns True if the task was successfully cancelled, False if it was already
    in a terminal state or not found.
    """
    task_uuid = uuid.UUID(task_id)

    async with AsyncSessionLocal() as db:
        run = await db.scalar(select(TaskRun).where(TaskRun.id == task_uuid))
        if run is None:
            logger.warning("cancel_task_not_found", task_id=task_id)
            return False

        if run.status in _TERMINAL_STATUSES:
            logger.warning("cancel_task_already_terminal", task_id=task_id, status=run.status)
            return False

        # Revoke the Celery task (terminate=True kills running worker process)
        if run.celery_task_id:
            from app.workers.celery_app import celery_app  # noqa: PLC0415

            celery_app.control.revoke(run.celery_task_id, terminate=True, signal="SIGTERM")

        run.status = STATUS_CANCELLED
        run.updated_at = datetime.now(UTC)
        await db.commit()

    logger.info("task_cancelled", task_id=task_id)
    return True
