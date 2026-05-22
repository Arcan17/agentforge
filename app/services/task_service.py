"""Task service — creates tasks and manages human approval via PostgreSQL.

All mutable state lives in the database.  Graph execution is delegated to the
Celery worker (app.workers.graph_worker).  No asyncio.Future, no in-process
queues, safe for multi-worker deployments.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import STATUS_AWAITING_APPROVAL, STATUS_PENDING
from app.core.logging import get_logger
from app.models.database import AsyncSessionLocal
from app.models.task_run import TaskRun
from app.workers.graph_worker import run_graph

logger = get_logger(__name__)


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

    # Non-blocking enqueue — Celery worker picks it up immediately
    run_graph.delay(task_id, original_task, hil)

    logger.info("task_created", task_id=task_id, human_in_loop=hil)
    return run


async def get_task(db: AsyncSession, task_id: str) -> TaskRun | None:
    """Fetch a TaskRun by id."""
    return await db.scalar(
        select(TaskRun).where(TaskRun.id == uuid.UUID(task_id))
    )


async def approve_task(task_id: str, decision: str, feedback: str | None = None) -> bool:
    """Store the human decision in PostgreSQL.

    The Celery worker polls task_runs.human_decision and resumes the graph
    when it sees a non-null value.

    Returns True if the task was in awaiting_approval state, False otherwise.
    """
    task_uuid = uuid.UUID(task_id)

    async with AsyncSessionLocal() as db:
        run = await db.scalar(select(TaskRun).where(TaskRun.id == task_uuid))
        if run is None or run.status != STATUS_AWAITING_APPROVAL:
            logger.warning("approve_task_not_awaiting", task_id=task_id, status=getattr(run, "status", None))
            return False

        run.human_decision = decision
        run.human_feedback = feedback
        await db.commit()

    logger.info("task_approved", task_id=task_id, decision=decision)
    return True
