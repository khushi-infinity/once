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
import re
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.models.api import (
    DraftEngine,
    SkillItemRow,
    StepRow,
    TeachExtractRequest,
    TeachExtractResponse,
)
from app.models.core import SkillType
from app.services import inference

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/teach", tags=["teach"])

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _deterministic_extract(transcript: str, skill_type: str) -> TeachExtractResponse:
    """Explicitly non-AI draft used only in mock mode (labeled in `engine`)."""
    text = " ".join(transcript.split())
    sentences = [s.strip() for s in re.split(r"[.;]\s*", text) if s.strip()]
    title = (sentences[0][:60]) if sentences else "My skill"
    tail = sentences[-1] if len(sentences) > 1 else text
    items: list[SkillItemRow] = []
    for chunk in re.split(r",|\band\b|\n", tail):
        name = re.sub(
            r"^(take|add|bring|pack|have|remember|i|i'll|me|a|an|the|my|some|of|that|it)+\b\s*",
            "",
            chunk.strip(),
            flags=re.IGNORECASE,
        ).strip(" .-,")
        if 1 < len(name) <= 60:
            items.append(SkillItemRow(name=name[:60].capitalize()))
    ambiguities = [
        "Parsed without AI (mock-mode deterministic splitter): confirm each item.",
    ]
    return TeachExtractResponse(
        title=f"{title} ({skill_type})"[:290],
        summary=text[:280],
        items=items,
        steps=[],
        ambiguities=ambiguities,
        engine=DraftEngine(provider="deterministic-mock", model=None, duration_ms=None),
    )


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


def _draft_from_result(result: inference.InferenceResult, summary: str | None = None) -> TeachExtractResponse:
    data = inference.parse_json_object(result.text)
    items = []
    for i in data.get("items", []):
        if isinstance(i, str):
            name, aliases = i, []
        elif isinstance(i, dict):
            name, aliases = i.get("name", ""), i.get("aliases", [])
        else:
            continue
        if str(name).strip():
            items.append(
                SkillItemRow(
                    name=str(name).strip()[:120],
                    aliases=[str(a) for a in aliases if str(a).strip()][:5],
                )
            )
    steps = []
    for q, s in enumerate(data.get("steps") or []):
        instruction = s if isinstance(s, str) else (s.get("instruction", "") if isinstance(s, dict) else "")
        if str(instruction).strip():
            steps.append(StepRow(order=q, instruction=str(instruction).strip()[:1000]))
    ambiguities = [str(a)[:200] for a in data.get("ambiguities", []) if str(a).strip()][:5]
    return TeachExtractResponse(
        title=(str(data.get("title", "My skill")) or "My skill").strip()[:300],
        summary=summary,
        items=items,
        steps=steps,
        ambiguities=ambiguities,
        engine=DraftEngine(
            provider=result.provider,
            model=result.model_id,
            duration_ms=result.duration_ms,
            request_id=result.request_id,
        ),
    )


@router.post("/extract", response_model=TeachExtractResponse)
def extract(req: TeachExtractRequest) -> TeachExtractResponse:
    settings = get_settings()

    if not settings.is_live:
        return _deterministic_extract(req.transcript, req.skill_type.value)

    _require_ai_configured()
    try:
        result = inference.extract_procedure(req.transcript, req.skill_type.value)
        return _draft_from_result(result)
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
        return _draft_from_result(result)
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
