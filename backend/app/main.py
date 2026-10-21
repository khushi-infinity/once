"""ONCE FastAPI entrypoint. Run: uv run uvicorn app.main:app --port 8000"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health, recall, skills, teach

app = FastAPI(title="ONCE", description="Teach once. Let it teach anyone, forever.")

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
