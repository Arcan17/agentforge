from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.models.database import create_tables

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    configure_logging(settings.log_level)
    logger.info("agentforge_startup", provider=settings.llm_provider)
    await create_tables()
    yield
    logger.info("agentforge_shutdown")


app = FastAPI(
    title="AgentForge",
    description="Multi-agent system with LangGraph — privacy-aware, observable, production-grade.",
    version="1.0.0",
    lifespan=lifespan,
)

# Register routers
from app.api.routers import health, human, metrics, stream, tasks  # noqa: E402

app.include_router(health.router)
app.include_router(tasks.router)
app.include_router(stream.router)
app.include_router(human.router)
app.include_router(metrics.router)
