"""Teach-extraction endpoints: transcript or photo → validated draft → teacher confirms.

The LLM only *proposes* structure; the teacher confirms/edits in the UI and
only the confirmed draft reaches POST /api/skills for persistence. AI never
writes to storage directly.

Modes, chosen explicitly (never auto-substituted):
- live: real AI extraction through the configured provider (openai-compatible
  or gemini); errors are surfaced truthfully;
- mock: deterministic non-AI parser for text, clearly labeled in the response.
  Photo extraction has no deterministic fallback, so it returns an honest 503.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.models.api import TeachExtractRequest, TeachExtractResponse
from app.models.core import SkillType
from app.services import inference
from app.services.drafting import deterministic_extract, draft_from_result

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/teach", tags=["teach"])

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _require_ai_configured(for_image: bool = False) -> None:
    settings = get_settings()
    if settings.inference_provider not in inference.PROVIDERS:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Unknown INFERENCE_PROVIDER={settings.inference_provider!r}. "
                f"Set one of {sorted(inference.PROVIDERS)} in backend/.env."
            ),
        )
    if settings.inference_provider == "gemini" and not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured. Add a free key to backend/.env "
            "or set INFERENCE_PROVIDER=openai-compatible.",
        )
    if for_image and settings.inference_provider == "openai-compatible":
        # Ollama's text-only models cannot read pixels; say so instead of faking it.
        logger.info("image extraction requested with provider=%s model=%s",
                    settings.inference_provider, settings.openai_model)


@router.post("/extract", response_model=TeachExtractResponse)
def extract(req: TeachExtractRequest) -> TeachExtractResponse:
    settings = get_settings()

    if not settings.is_live:
        return deterministic_extract(req.transcript, req.skill_type.value)

    _require_ai_configured()
    try:
        result = inference.extract_procedure(req.transcript, req.skill_type.value)
        return draft_from_result(result)
    except HTTPException:
        raise
    except Exception as exc:  # truthfully surfaced — never substituted
        logger.warning("extraction failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"AI extraction failed ({type(exc).__name__}). "
            "The stored-skill path still works; try again or teach manually.",
        ) from exc


@router.post("/extract-image", response_model=TeachExtractResponse)
async def extract_image(
    file: Annotated[UploadFile, File()],
    note: Annotated[str, Form()] = "",
    skill_type: Annotated[SkillType, Form()] = SkillType.packing,
) -> TeachExtractResponse:
    """Photo → draft. The teacher reviews every proposed item before saving."""
    settings = get_settings()
    if not settings.is_live:
        raise HTTPException(
            status_code=503,
            detail="Photo extraction needs a live AI provider. Set APP_MODE=live and "
            "configure INFERENCE_PROVIDER; mock mode has no vision.",
        )
    _require_ai_configured(for_image=True)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type {file.content_type!r}; use JPEG, PNG or WebP.",
        )
    image = await file.read()
    if not image:
        raise HTTPException(status_code=400, detail="empty image upload")
    if len(image) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image larger than 8 MB")
    try:
        result = inference.extract_procedure_from_image(
            image, file.content_type, note, skill_type.value
        )
        return draft_from_result(result)
    except HTTPException:
        raise
    except Exception as exc:  # truthfully surfaced — never substituted
        logger.warning("image extraction failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=(
                f"Photo analysis failed ({type(exc).__name__}). "
                "If the configured model is text-only, switch to a vision-capable "
                "provider/model or teach by text instead."
            ),
        ) from exc
