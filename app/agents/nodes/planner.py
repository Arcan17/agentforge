"""Planner node — decomposes the task into subtasks."""

import json
import time

from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import retry, stop_after_attempt, wait_exponential

from app.agents.state import AgentState
from app.core.constants import AGENT_PLANNER, STATUS_PLANNING, SYSTEM_PLANNER
from app.core.logging import get_logger
from app.services.llm.base import get_llm

logger = get_logger(__name__)

_PLANNER_PROMPT = """\
Task: {task}

Decompose this task into 3-6 clear, researchable subtasks.

Respond with a JSON object exactly like this:
{{
  "subtasks": [
    "Subtask 1 description",
    "Subtask 2 description",
    ...
  ]
}}
"""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _call_llm(task: str) -> tuple[list[str], int]:
    """Call LLM and return (subtasks, tokens_used)."""
    llm = get_llm(temperature=0.2)
    messages = [
        SystemMessage(content=SYSTEM_PLANNER),
        HumanMessage(content=_PLANNER_PROMPT.format(task=task)),
    ]
    response = llm.invoke(messages)
    content = str(response.content)

    # Parse JSON from response
    # Handle markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()

    data = json.loads(content)
    subtasks = data.get("subtasks", [])
    if not subtasks:
        raise ValueError("Planner returned empty subtasks list")

    tokens = getattr(response, "usage_metadata", {}) or {}
    total_tokens = tokens.get("total_tokens", 0) if isinstance(tokens, dict) else 0
    return subtasks, total_tokens


def planner_node(state: AgentState) -> dict:
    """LangGraph node: plan the task."""
    t0 = time.monotonic()
    logger.info("planner_start", task_id=state["task_id"])

    try:
        subtasks, tokens = _call_llm(state["original_task"])
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "planner_complete",
            task_id=state["task_id"],
            subtasks=len(subtasks),
            tokens=tokens,
            duration_ms=duration_ms,
        )
        return {
            "subtasks": subtasks,
            "status": STATUS_PLANNING,
            "active_agent": AGENT_PLANNER,
            "tokens_used": state.get("tokens_used", 0) + tokens,
            "errors": [],
        }
    except Exception as exc:
        logger.error("planner_failed", task_id=state["task_id"], error=str(exc))
        return {
            "subtasks": [state["original_task"]],  # fallback: treat task as single subtask
            "status": STATUS_PLANNING,
            "active_agent": AGENT_PLANNER,
            "errors": [f"planner: {exc}"],
        }
