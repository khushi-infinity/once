from fastapi import APIRouter

from app.config import get_settings
from app.models.api import HealthResponse, InferenceStatus
from app.services import inference

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
            provider=settings.inference_provider,
            model=inference.current_model_id(),
        ),
    )
