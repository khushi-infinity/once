from fastapi import APIRouter

from app.config import get_settings
from app.models.api import HealthResponse, InferenceStatus
from app.services import inference

router = APIRouter(tags=["meta"])

VERSION = "0.2.0"


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    # Mock mode extraction is a deterministic non-AI parser. Do not label it
    # with a cloud model the process will never call.
    if settings.is_live:
        effective = InferenceStatus(
            provider=settings.inference_provider,
            model=inference.current_model_id(),
        )
    else:
        effective = InferenceStatus(provider="deterministic-mock", model=None)
    return HealthResponse(
        status="ok",
        app_mode=settings.app_mode,
        version=VERSION,
        inference=effective,
    )
