from datetime import datetime

from pydantic import BaseModel, Field


class TaskCreateRequest(BaseModel):
    task: str = Field(..., min_length=10, max_length=2000, description="Task description")
    human_in_loop: bool | None = Field(
        None, description="Override global HUMAN_IN_LOOP setting for this task"
    )


class TaskResponse(BaseModel):
    task_id: str
    status: str
    original_task: str
    human_in_loop: bool
    critic_score: float | None
    revision_count: int
    total_tokens: int
    total_duration_ms: int | None
    final_report: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HumanApproveRequest(BaseModel):
    decision: str = Field(
        ..., pattern="^(approve|reject|feedback)$",
        description="approve | reject | feedback"
    )
    feedback: str | None = Field(
        None,
        max_length=2000,
        description="Required when decision=feedback",
    )
