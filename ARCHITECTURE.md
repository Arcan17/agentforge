# AgentForge — Architecture

## Overview

AgentForge is a **multi-agent research pipeline** built on [LangGraph](https://github.com/langchain-ai/langgraph). A single task is automatically decomposed, researched on the web, analysed, critiqued, and written into a polished report — with optional human review at the gate before the final write.

---

## Graph

```
START
  │
  ▼
┌──────────┐     3-6 subtasks
│ PLANNER  │────────────────────────────────────────────────┐
└──────────┘                                                │
  │                                                         │
  ▼                                                         │
┌────────────┐   web_search + url_reader per subtask       │
│ RESEARCHER │                                              │
└────────────┘                                              │
  │                                                         │
  ▼                                                         │
┌──────────┐   calculator + file_reader tools              │
│ ANALYST  │◄──────────────────────────────────────────────┘
└──────────┘          (revision cycle)
  │
  ▼
┌────────┐
│ CRITIC │──── score ≥ 0.75  ──────────────────────────────┐
└────────┘         (or max revisions hit)                  │
  │                                                         │
  │ score < 0.75 AND revisions < max                       │
  ▼                                                         │
increment_revision ──► ANALYST                              │
                                                            │
                        ┌───────────────────────────────────┘
                        │
                        ▼
                  human_in_loop?
                   yes │        no
                       │         └──────────────┐
                       ▼                        ▼
              ┌────────────────┐          ┌────────┐
              │  HUMAN_GATE    │          │ WRITER │
              │  (interrupt)   │          └────────┘
              └────────────────┘               │
                 approve │  reject             │
                feedback │  ──► END            │
                         ▼                     │
                      ANALYST                  │
                         │                     │
                         ▼                     │
                      CRITIC ────────────────► │
                                               ▼
                                             END
```

---

## Agents

| Agent | Tools | Responsibility |
|-------|-------|---------------|
| **Planner** | — | Decompose task into 3–6 concrete subtasks (JSON output) |
| **Researcher** | `web_search`, `url_reader` | Gather data per subtask; agentic tool loop (≤ 6 calls) |
| **Analyst** | `calculator`, `file_reader` | Synthesise research → structured analysis; agentic loop (≤ 4 calls) |
| **Critic** | — | Score analysis 0–1; approve if ≥ 0.75 |
| **Human Gate** | — | `interrupt()` pauses graph; resumes on `/approve` |
| **Writer** | — | Generate polished final report (800–1 500 words) |

---

## Revision Loop

```
Critic score < 0.75  →  increment_revision  →  Analyst
                                            (with critic feedback in prompt)

Critic score ≥ 0.75  →  Human Gate (if human_in_loop=True)  →  Writer
                    or  →  Writer directly (if human_in_loop=False)

revision_count ≥ max_revisions  →  skip to Writer regardless of score
  (report prefixed with "best-effort" note)
```

---

## Human-in-the-Loop

1. When `HUMAN_IN_LOOP=true` (global) or `human_in_loop=true` per task, the graph pauses at `human_gate` via `interrupt()`.
2. An `awaiting_approval` SSE event is sent to all connected clients.
3. A reviewer calls `POST /tasks/{id}/approve` with one of:
   - `approve` → Writer runs, final report generated.
   - `reject` → Task terminates with status `failed`.
   - `feedback` + text → Analyst re-runs with the feedback embedded in its prompt.
4. The graph resumes via `Command(resume=decision)`.

**Timeout**: If no human decision arrives within 1 hour, the task auto-approves.

---

## State

`AgentState` is a `TypedDict` shared across all nodes:

```python
{
  "task_id":        str,              # UUID
  "original_task":  str,
  "subtasks":       list[str],        # from Planner
  "research_results": list[dict],     # from Researcher
  "analysis":       str,              # from Analyst
  "critic_score":   float,
  "critic_feedback": str,
  "critic_approved": bool,
  "revision_count": int,
  "human_in_loop":  bool,
  "human_decision": str | None,
  "human_feedback": str | None,
  "final_report":   str | None,
  "status":         str,
  "active_agent":   str,
  "tokens_used":    int,
  "errors":         list[str],        # Annotated: additive merge
  "messages":       list[BaseMessage] # Annotated: add_messages
}
```

---

## SSE Streaming

Each task gets an `asyncio.Queue` (maxsize 200). The background `asyncio.Task` running the graph publishes events to the queue. Clients consume via `GET /tasks/{id}/stream` (Server-Sent Events, `sse-starlette`).

Event types:
- `agent_start` — node began
- `agent_complete` — node finished (includes token count)
- `agent_error` — node failed
- `awaiting_approval` — human gate reached
- `task_complete` — pipeline finished
- `task_failed` — unrecoverable error

---

## Persistence (PostgreSQL)

```
task_runs       — one row per task; status, final_report, metrics
agent_steps     — one row per node execution; output_data (JSON)
agent_events    — SSE events mirrored to DB for audit
```

Async SQLAlchemy 2.x (`asyncpg` driver). Alembic for migrations.

---

## Retry Strategy

All LLM calls are wrapped with `tenacity`:
```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8), reraise=True)
```
On final failure: Planner falls back to treating the whole task as one subtask; Critic defaults to approved; Writer records the error.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | — | Required if provider=anthropic |
| `OPENAI_API_KEY` | — | Required if provider=openai |
| `DATABASE_URL` | postgres://... | Async PostgreSQL URL |
| `HUMAN_IN_LOOP` | `false` | Global default; overridable per task |
| `MAX_REVISIONS` | `3` | Max analyst→critic cycles before force-write |
| `CRITIC_APPROVAL_THRESHOLD` | `0.75` | Minimum score to approve |
| `API_KEY` | `` | Leave empty to disable auth |

---

## Project Structure

```
agentforge/
├── app/
│   ├── agents/
│   │   ├── graph.py           ← StateGraph, routing functions
│   │   ├── state.py           ← AgentState TypedDict
│   │   ├── nodes/             ← planner, researcher, analyst, critic, writer, human_gate
│   │   └── tools/             ← calculator, file_reader, web_search, url_reader
│   ├── api/
│   │   ├── routers/           ← tasks, stream, human, metrics, health
│   │   └── schemas/           ← Pydantic models
│   ├── core/                  ← config, logging, auth, constants
│   ├── models/                ← SQLAlchemy ORM (task_run, agent_step, agent_event)
│   └── services/              ← task_service, stream_service, metrics_service
├── alembic/                   ← DB migrations
├── tests/                     ← 104 pytest tests
├── scripts/demo.py            ← CLI demo
└── data/                      ← Sample task files
```
