from fastapi import APIRouter

from app.config import get_settings
from app.models.api import HealthResponse, InferenceStatus

router = APIRouter(tags=["meta"])

VERSION = "0.2.0"


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        app_mode=settings.app_mode,
        version=VERSION,
        inference=InferenceStatus(
            provider="gemini",
            model=settings.gemini_model_id,
        ),
    )
