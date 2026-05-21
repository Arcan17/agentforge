from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.task import TaskCreateRequest, TaskResponse
from app.core.auth import require_api_key
from app.models.database import get_db
from app.services.task_service import create_task, get_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskResponse, dependencies=[Depends(require_api_key)])
async def create_task_endpoint(
    body: TaskCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Create a new task run and start execution immediately."""
    run = await create_task(db, body.task, human_in_loop=body.human_in_loop)
    return TaskResponse(
        task_id=str(run.id),
        status=run.status,
        original_task=run.original_task,
        human_in_loop=run.human_in_loop,
        critic_score=run.critic_score,
        revision_count=run.revision_count,
        total_tokens=run.total_tokens,
        total_duration_ms=run.total_duration_ms,
        final_report=run.final_report,
        error=run.error,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


@router.get("/{task_id}", response_model=TaskResponse, dependencies=[Depends(require_api_key)])
async def get_task_endpoint(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Get current status and result of a task run."""
    run = await get_task(db, task_id)
    if not run:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse(
        task_id=str(run.id),
        status=run.status,
        original_task=run.original_task,
        human_in_loop=run.human_in_loop,
        critic_score=run.critic_score,
        revision_count=run.revision_count,
        total_tokens=run.total_tokens,
        total_duration_ms=run.total_duration_ms,
        final_report=run.final_report,
        error=run.error,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )
