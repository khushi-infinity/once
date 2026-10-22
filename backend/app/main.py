"""ONCE FastAPI entrypoint. Run: uv run uvicorn app.main:app --port 8000"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.mcp_server import mcp
from app.routers import health, recall, skills, teach, window_guide

# Serve the MCP Streamable HTTP endpoint from the same process as the HTTP API.
# That is what makes /alexa truthful in BOTH modes: in live mode both surfaces
# use DynamoDB, and in mock mode they share the same in-memory store (skills,
# share grants and learner sessions). The standalone `python -m app.mcp_server`
# process remains available for the independent smoke client.
mcp_http_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Mounting a Starlette sub-app does not run its lifespan automatically;
    # the MCP session manager needs this startup/shutdown.
    async with mcp_http_app.router.lifespan_context(mcp_http_app):
        yield


app = FastAPI(
    title="ONCE",
    description="Teach once. Let it teach anyone, forever.",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(skills.router)
app.include_router(teach.router)
app.include_router(recall.router)
app.include_router(window_guide.router)

# Keep this last: the mounted MCP app owns /mcp and must not shadow the API.
app.mount("/", mcp_http_app)
