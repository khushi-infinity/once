"""Teach-extraction endpoint: transcript → validated draft → teacher confirms.

The LLM only *proposes* structure; the teacher confirms/edits in the UI and
only the confirmed draft reaches POST /api/skills for persistence. AI never
writes to storage directly.

Modes, chosen explicitly (never auto-substituted):
- live: real free-tier Gemini extraction; errors are surfaced truthfully;
- mock: deterministic non-AI parser, clearly labeled as such in the response.
"""
import logging
import re

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.models.api import (
    DraftEngine,
    SkillItemRow,
    StepRow,
    TeachExtractRequest,
    TeachExtractResponse,
)
from app.services import inference

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/teach", tags=["teach"])


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
    if not items:
        items = []
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


def _require_ai_configured() -> None:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI extraction is not configured: set GEMINI_API_KEY in backend/.env "
            "(free key at aistudio.google.com). Stored skills and recall still work.",
        )


@router.post("/extract", response_model=TeachExtractResponse)
def extract(req: TeachExtractRequest) -> TeachExtractResponse:
    settings = get_settings()

    if not settings.is_live:
        return _deterministic_extract(req.transcript, req.skill_type.value)

    _require_ai_configured()
    try:
        result = inference.extract_procedure(
            req.transcript, req.skill_type.value
        )
        data = inference.parse_json_object(result.text)
        items = [
            SkillItemRow(
                name=str(i["name"]).strip()[:120],
                aliases=[str(a) for a in i.get("aliases", []) if str(a).strip()][:5],
            )
            for i in data.get("items", [])
            if str(i.get("name", "")).strip()
        ]
        steps = [
            StepRow(order=q, instruction=str(s["instruction"]).strip()[:1000])
            for q, s in enumerate(data.get("steps") or [], start=0)
        ]
        ambiguity = [str(a)[:200] for a in data.get("ambiguities", []) if str(a).strip()][:5]
        return TeachExtractResponse(
            title=(str(data.get("title", "My skill")) or "My skill").strip()[:300],
            summary=None,
            items=items,
            steps=steps,
            ambiguities=ambiguity,
            engine=DraftEngine(
                provider=result.provider,
                model=result.model_id,
                duration_ms=result.duration_ms,
                request_id=result.request_id,
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:  # truthfully surfaced — never substituted
        logger.warning("extraction failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"AI extraction failed ({type(exc).__name__}). "
            "The stored-skill path still works; try again or teach manually.",
        ) from exc
