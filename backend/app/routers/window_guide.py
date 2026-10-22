"""Window guide endpoint for the native Mac helper.

Only the window the user explicitly captures is sent. The image is processed
in memory, never written to disk by the backend, and never logged.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.models.api import WindowGuideResponse
from app.services import inference, window_guide

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/window", tags=["window"])

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/guide", response_model=WindowGuideResponse)
async def guide(
    file: Annotated[UploadFile, File()],
    question: Annotated[str, Form()],
    app_name: Annotated[str, Form()] = "",
    window_title: Annotated[str, Form()] = "",
) -> WindowGuideResponse:
    settings = get_settings()
    if not settings.is_live:
        raise HTTPException(
            status_code=503,
            detail=(
                "Window guidance needs a live AI provider. Set APP_MODE=live and "
                "configure INFERENCE_PROVIDER in backend/.env."
            ),
        )
    chain = [settings.inference_provider]
    fallback = settings.inference_fallback_provider.strip()
    if fallback and fallback != settings.inference_provider:
        chain.append(fallback)
    unknown = [p for p in chain if p not in inference.PROVIDERS]
    if unknown:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Unknown inference provider {unknown[0]!r}. "
                f"Use one of {sorted(inference.PROVIDERS)}."
            ),
        )
    configured = any(
        (p == "gemini" and settings.gemini_api_key)
        or (p == "openrouter" and settings.openrouter_api_key)
        or p == "openai-compatible"
        for p in chain
    )
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="No inference provider has credentials for the window guide.",
        )
    if len(question.strip()) < 3:
        raise HTTPException(status_code=400, detail="Ask a question about the window.")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type {file.content_type!r}; use PNG, JPEG or WebP.",
        )
    image = await file.read()
    if not image:
        raise HTTPException(status_code=400, detail="empty window screenshot")
    if len(image) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="window screenshot larger than 8 MB")

    try:
        return window_guide.guide_window(
            image,
            file.content_type,
            question.strip(),
            app_name=app_name.strip(),
            window_title=window_title.strip(),
        )
    except HTTPException:
        raise
    except Exception as exc:  # truthfully surfaced, never replaced with a fake answer
        logger.warning("window guide failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=(
                f"Window analysis failed ({type(exc).__name__}). "
                "Check the configured vision model and try again."
            ),
        ) from exc
