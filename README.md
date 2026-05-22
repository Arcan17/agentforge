# AgentForge

**Production-grade multi-agent research pipeline** built with LangGraph, FastAPI, and PostgreSQL.

A task description becomes a structured research report in minutes — decomposed by a Planner, researched on the web, analysed, critiqued with automatic revision loops, and optionally gated by a human reviewer before the final write.

---

## Key Features

| Feature | Detail |
|---------|--------|
| **5-node LangGraph pipeline** | Planner → Researcher → Analyst → Critic → Writer |
| **Automatic revision loop** | Critic scores 0–1; if < 0.75, Analyst revises with feedback (max 3 cycles) |
| **Human-in-the-loop** | `interrupt()` pauses graph; `/approve` endpoint resumes it; decision persisted in PostgreSQL |
| **Real-time SSE streaming** | DB-polled agent events streamed per task (`agent_start`, `agent_complete`, …) |
| **Tool-using agents** | `web_search` (DuckDuckGo), `url_reader`, `calculator`, `file_reader` |
| **PostgreSQL persistence** | Full audit trail: task runs, agent steps, events |
| **Celery + Redis** | Graph execution runs in a separate worker process — API stays responsive |
| **Dual LLM support** | Switch between Anthropic (claude-3-5-sonnet) and OpenAI (gpt-4o-mini) via env var |
| **Retry logic** | `tenacity` — 3 attempts, exponential back-off 1–8 s |
| **112 tests** | Unit + integration, zero real LLM calls, SQLite in CI |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Anthropic **or** OpenAI API key

> **Architecture**: `docker compose up` starts four services — PostgreSQL, Redis, the FastAPI API server, and the Celery worker that runs LangGraph. The API server stays responsive while the worker executes long-running LLM pipelines.


### 1. Clone & configure

```bash
git clone https://github.com/Arcan17/agentforge.git
cd agentforge
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY or OPENAI_API_KEY
```

### 2. Start

```bash
docker compose up -d
curl http://localhost:8000/health   # → {"status": "ok"}
```

### 3. Create a task

```bash
curl -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"task": "Research the fintech market in Chile and identify the top 3 investment opportunities for 2025."}'
```

Response:
```json
{
  "task_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "pending",
  "original_task": "Research the fintech market..."
}
```

### 4. Stream live events

```bash
curl -N http://localhost:8000/tasks/3fa85f64-.../stream
```

Output:
```
event: agent_start
data: {"agent": "planner", "step": 1, "timestamp": "..."}

event: agent_complete
data: {"agent": "planner", "step": 1, "tokens": 320, "status": "planning", ...}

event: agent_start
data: {"agent": "researcher", "step": 2, ...}
...
event: task_complete
data: {"task_id": "3fa85f64-...", "status": "complete", "total_tokens": 4821, "duration_ms": 38400}
```

### 5. Get the final report

```bash
curl http://localhost:8000/tasks/3fa85f64-...
```

### 6. Check metrics

```bash
curl http://localhost:8000/metrics
```

```json
{
  "period_hours": 24,
  "runs_total": 5,
  "runs_successful": 5,
  "success_rate_pct": 100.0,
  "avg_duration_ms": 41200,
  "p95_duration_ms": 67800,
  "avg_tokens_per_run": 4950,
  "avg_revisions": 1.2,
  "agent_avg_latency_ms": {
    "planner": 1850,
    "researcher": 18400,
    "analyst": 9200,
    "critic": 3100,
    "writer": 8650
  }
}
```

---

## Human-in-the-Loop

Run a task with human approval required:

```bash
# Create task with human review enabled
curl -X POST http://localhost:8000/tasks \
  -d '{"task": "Analyse Q1 financials...", "human_in_loop": true}'

# SSE stream will emit: event: awaiting_approval
# Approve:
curl -X POST http://localhost:8000/tasks/{task_id}/approve \
  -d '{"decision": "approve"}'

# Or send feedback back to the Analyst:
curl -X POST http://localhost:8000/tasks/{task_id}/approve \
  -d '{"decision": "feedback", "feedback": "Please add competitor analysis for Nubank."}'

# Or reject:
curl -X POST http://localhost:8000/tasks/{task_id}/approve \
  -d '{"decision": "reject"}'
```

---

## Run the Demo Script

```bash
# With Docker running:
python scripts/demo.py

# Custom task or host:
python scripts/demo.py --task "Analyse the EV market in Europe" --url http://localhost:8000
```

---

## Development Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Set DATABASE_URL to point at your local Postgres or use:
docker compose up -d db   # just the DB

# Run tests (SQLite, no real API calls):
pytest -v

# Lint:
ruff check .
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/tasks` | Create & start a task |
| `GET` | `/tasks/{id}` | Get task status & report |
| `GET` | `/tasks/{id}/stream` | SSE event stream |
| `POST` | `/tasks/{id}/approve` | Submit human decision (`approve` / `reject` / `feedback`) |
| `GET` | `/metrics?hours=24` | Aggregated performance metrics |

Interactive docs: `http://localhost:8000/docs`

---

## Configuration

Copy `.env.example` to `.env` and set:

```env
# Required — pick one
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# LLM_PROVIDER=openai

# Database
DATABASE_URL=postgresql+asyncpg://agentforge:agentforge@localhost:5432/agentforge

# Agent tuning (optional)
MAX_REVISIONS=3
CRITIC_APPROVAL_THRESHOLD=0.75
HUMAN_IN_LOOP=false

# Auth (optional — leave empty to disable)
API_KEY=
```

---

## Project Structure

```
agentforge/
├── app/
│   ├── agents/
│   │   ├── graph.py           ← LangGraph StateGraph
│   │   ├── state.py           ← AgentState TypedDict
│   │   ├── nodes/             ← One file per agent node
│   │   └── tools/             ← calculator, file_reader, web_search, url_reader
│   ├── api/
│   │   ├── routers/           ← FastAPI routers
│   │   └── schemas/           ← Pydantic request/response models
│   ├── core/                  ← Settings, logging, auth, constants
│   ├── models/                ← SQLAlchemy ORM models
│   └── services/              ← Business logic (task, stream, metrics)
├── alembic/                   ← Database migrations
├── tests/                     ← 104 tests
├── scripts/demo.py            ← End-to-end demo
└── data/                      ← Sample task files
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full graph diagram and design decisions.

---

## Tech Stack

- **Python 3.11** · **FastAPI 0.115** · **LangGraph 0.2.68**
- **LangChain Anthropic / OpenAI** · **PostgreSQL 16** · **SQLAlchemy 2.0**
- **Celery 5.4** · **Redis 7** · **sse-starlette** · **httpx** · **BeautifulSoup4** · **tenacity**
- **pytest 8.3** · **ruff** · **Docker**

---

## License

MIT
