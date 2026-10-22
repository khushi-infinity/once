"""Deterministic, non-AI draft extraction used in mock mode.

This is deliberately boring: the teacher still confirms every item before it is
saved. The draft is labeled `deterministic-mock`, and the HTTP teach endpoint
and the MCP `once_extract_draft` tool share it so mock mode behaves the same on
both surfaces.
"""
import re

from app.models.api import DraftEngine, SkillItemRow, StepRow, TeachExtractResponse
from app.services import inference


def draft_from_result(
    result: inference.InferenceResult, summary: str | None = None
) -> TeachExtractResponse:
    """Normalize provider output into the same draft shape in every surface."""
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
        instruction = (
            s
            if isinstance(s, str)
            else (s.get("instruction", "") if isinstance(s, dict) else "")
        )
        if str(instruction).strip():
            steps.append(StepRow(order=q, instruction=str(instruction).strip()[:1000]))
    ambiguities = [
        str(a)[:200] for a in data.get("ambiguities", []) if str(a).strip()
    ][:5]
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


def deterministic_extract(transcript: str, skill_type: str) -> TeachExtractResponse:
    """Split a teacher's sentence into a draft without calling a model."""
    text = " ".join(transcript.split())
    sentences = [s.strip() for s in re.split(r"[.;]\s*", text) if s.strip()]
    # Strip the instruction wrapper so the draft title reads like a skill, not
    # like the sentence the teacher used to invoke ONCE. Title from the first
    # sentence only, never a tail fragment from the list.
    first_sentence = sentences[0] if sentences else text
    title_source = re.sub(
        r"^(remember(?:\s+that|\s+how)?|teach\s+me(?:\s+that)?|save\s+this|learn\s+this)"
        r"\b[:\s,-]*",
        "",
        first_sentence,
        flags=re.IGNORECASE,
    )
    title_source = re.sub(r"^i\s+", "", title_source, flags=re.IGNORECASE)
    title_words = title_source.split()[:10]
    title = " ".join(title_words).strip(" .,-") or "My skill"
    title = title[0].upper() + title[1:] if title else "My skill"
    # The list is usually the sentence with the most separators, not
    # necessarily the last one ("... . Charge everything the night before.").
    candidates = sentences or [text]
    tail = max(
        candidates,
        key=lambda s: s.count(",") + s.lower().count(" and "),
    )
    items: list[SkillItemRow] = []
    leading = (
        r"^(?:(?:take|add|bring|pack|have|remember|for|on|during|at|"
        r"i|i'll|me|a|an|the|my|some|of|that|it)\b\s*)+"
    )
    for chunk in re.split(r",|\band\b|\n", tail):
        name = re.sub(leading, "", chunk.strip(), flags=re.IGNORECASE).strip(" .-,")
        # A context clause can precede the verb ("For conferences I pack ...").
        name = re.sub(
            r"^.*?\b(?:i\s+)?(?:pack|take|bring|need|have)\b\s+",
            "",
            name,
            flags=re.IGNORECASE,
        )
        name = re.sub(leading, "", name, flags=re.IGNORECASE).strip(" .-,")
        # Drop a trailing occasion clause ("charger for conferences") from the
        # deterministic draft; the teacher can put context back if it matters.
        name = re.sub(
            r"\s+(?:for|on|during|at)\s+.*$", "", name, flags=re.IGNORECASE
        ).strip(" .-,")
        if 1 < len(name) <= 60:
            items.append(SkillItemRow(name=name[:1].upper() + name[1:60]))
    ambiguities = [
        "Parsed without AI (mock-mode deterministic splitter): confirm each item.",
    ]
    return TeachExtractResponse(
        title=title[:290],
        summary=text[:280],
        items=items,
        steps=[],
        ambiguities=ambiguities,
        engine=DraftEngine(provider="deterministic-mock", model=None, duration_ms=None),
    )
