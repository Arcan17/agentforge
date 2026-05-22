# Deploying AgentForge to Railway

This guide walks through deploying all five services to [Railway](https://railway.app).

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│  Railway Project                                        │
│                                                         │
│  ┌──────────┐  ┌───────┐  ┌──────────┐  ┌──────────┐  │
│  │PostgreSQL│  │ Redis │  │  FastAPI │  │  Celery  │  │
│  │ (plugin) │  │(plugin│  │   API    │  │  Worker  │  │
│  └──────────┘  └───────┘  └──────────┘  └──────────┘  │
│                                                         │
│  ┌────────────────────────┐                             │
│  │   Next.js Frontend     │  (root dir: ./frontend)     │
│  └────────────────────────┘                             │
└─────────────────────────────────────────────────────────┘
```

---

## Step-by-step

### 1. Create a Railway project

Go to [railway.app](https://railway.app) → **New Project** → **Empty project**.

---

### 2. Add PostgreSQL

Click **+ New** → **Database** → **PostgreSQL**.

After it provisions, click the service → **Variables** and note the value of
`DATABASE_URL`.  It looks like:

```
postgresql://postgres:password@monorail.proxy.rlwy.net:12345/railway
```

Railway delivers plain `postgresql://` URLs.  AgentForge **auto-converts** this
to `postgresql+asyncpg://` at startup — you can paste it as-is.

---

### 3. Add Redis

Click **+ New** → **Database** → **Redis**.

Note the `REDIS_URL` value — it looks like:

```
redis://default:password@monorail.proxy.rlwy.net:12346
```

---

### 4. Deploy the FastAPI backend

Click **+ New** → **GitHub Repo** → select `agentforge`.

#### Settings → General
- **Root directory**: `/` (leave empty — repo root)
- **Start command**: *(leave empty — Dockerfile CMD is used)*

> The `Dockerfile` at the repo root handles build and startup.
> It runs `alembic upgrade head` then starts uvicorn on `$PORT`.

#### Settings → Variables

Set the following environment variables:

```env
ENVIRONMENT=production
DATABASE_URL=<paste from step 2 — postgresql:// is fine>
CELERY_BROKER_URL=<REDIS_URL from step 3>
CELERY_RESULT_BACKEND=<REDIS_URL from step 3>
LLM_PROVIDER=openai
OPENAI_API_KEY=<your key>
API_KEY=<generate a long random string, e.g. openssl rand -hex 32>
CORS_ORIGINS=http://localhost:3000
```

> You'll update `CORS_ORIGINS` after deploying the frontend (step 6).

#### After deploy
Note the public URL Railway assigns, e.g. `https://agentforge-api.railway.app`.

---

### 5. Deploy the Celery worker

Click **+ New** → **GitHub Repo** → select `agentforge` again (same repo,
second service).

#### Settings → General
- **Root directory**: `/` (repo root)
- **Start command**:
  ```bash
  celery -A app.workers.celery_app worker --loglevel=info --concurrency=1
  ```
  Set `--concurrency=1` initially to keep costs low.

> Railway will build this service using the same `Dockerfile`.  The custom
> start command overrides the Dockerfile CMD.

#### Settings → Variables

Same as the backend, **minus** `CORS_ORIGINS` (the worker doesn't serve HTTP):

```env
ENVIRONMENT=production
DATABASE_URL=<same as backend>
CELERY_BROKER_URL=<REDIS_URL>
CELERY_RESULT_BACKEND=<REDIS_URL>
LLM_PROVIDER=openai
OPENAI_API_KEY=<your key>
API_KEY=<same key as backend>
```

> Railway **does not** expose a public port for this service — that's correct.
> The worker only consumes from Redis; it doesn't accept HTTP connections.

---

### 6. Deploy the Next.js frontend

Click **+ New** → **GitHub Repo** → select `agentforge` one more time.

#### Settings → General
- **Root directory**: `frontend`
- **Build command**: `npm install && npm run build`
- **Start command**: `npm start`  *(package.json uses `${PORT:-3000}` automatically)*

#### Settings → Variables

> ⚠️  `NEXT_PUBLIC_*` variables are **inlined at build time** by Next.js.
> Set them **before** deploying — changes require a redeploy.

```env
NEXT_PUBLIC_API_BASE_URL=https://agentforge-api.railway.app  # your backend URL from step 4
NEXT_PUBLIC_API_KEY=<same API_KEY as backend>
```

Railway assigns a public URL to this service too, e.g.
`https://agentforge-frontend.railway.app`.

---

### 7. Wire CORS

Go back to the **backend** service → Variables → update:

```env
CORS_ORIGINS=https://agentforge-frontend.railway.app
```

Redeploy the backend (Railway will do this automatically when you save the var).

---

### 8. Verify the full stack

```bash
# Backend health
curl https://agentforge-api.railway.app/health
# → {"status": "ok"}

# Create a task
curl -X POST https://agentforge-api.railway.app/tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your_api_key>" \
  -d '{"task": "Research the EV market in Chile for 2025."}'
# → {"task_id": "...", "status": "pending", ...}

# Check task status
curl https://agentforge-api.railway.app/tasks/<task_id> \
  -H "X-API-Key: <your_api_key>"

# Open the dashboard
open https://agentforge-frontend.railway.app
```

---

## Checklist

- [ ] PostgreSQL service running
- [ ] Redis service running
- [ ] Backend responds to `GET /health`
- [ ] Backend `GET /docs` shows Swagger UI
- [ ] Worker is consuming tasks (check logs: *"celery@... ready"*)
- [ ] Frontend loads at `https://...railway.app`
- [ ] Dashboard shows API Online badge
- [ ] Create task → task appears as `pending` → transitions to `running`
- [ ] Task completes with final report
- [ ] Export `.md` works
- [ ] Human-in-loop: task pauses at `awaiting_approval`, approval resumes it

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Backend crashes on startup | Wrong `DATABASE_URL` scheme | Ensure it starts with `postgresql://` or `postgresql+asyncpg://` |
| Tasks stuck in `pending` | Worker not connected to Redis | Check `CELERY_BROKER_URL` in worker service matches Redis URL |
| SSE stream fails | `API_KEY` set but frontend doesn't send it | Ensure `NEXT_PUBLIC_API_KEY` is set in frontend service |
| CORS error in browser | `CORS_ORIGINS` doesn't include frontend URL | Update backend `CORS_ORIGINS` and redeploy |
| Frontend shows wrong API URL | `NEXT_PUBLIC_API_BASE_URL` was set after build | Update the var and **redeploy** the frontend service |
| Alembic migration fails | DB not yet healthy when API starts | Railway retries on failure — check the build logs |

---

## Cost estimate (Railway Starter Plan)

| Service | Memory | Estimated cost |
|---------|--------|---------------|
| PostgreSQL | 512 MB | ~$5/mo |
| Redis | 256 MB | ~$3/mo |
| FastAPI | 512 MB | ~$5/mo |
| Celery Worker | 512 MB | ~$5/mo |
| Next.js Frontend | 256 MB | ~$3/mo |
| **Total** | | **~$21/mo** |

> For a demo/portfolio project you can reduce costs by using Railway's free tier
> (500 hours/month) or pausing services when not actively demonstrating.
