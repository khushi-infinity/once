"""Grounded recall logic shared by the HTTP API and the MCP server.

No chatbot guessing: retrieve the best-matching saved skill, then compare its
required items against what the reader explicitly confirms. Unconfirmed items
are reported as *not confirmed* — never as proof that something is absent.
"""
import re

from app.models.api import RecallMissingItem, RecallResponse
from app.models.core import Skill
from app.services.skill_store import get_store

STOPWORDS = {
    "a", "am", "an", "and", "are", "as", "at", "be", "before", "bring", "can",
    "check", "do", "for", "from", "get", "going", "have", "i", "in", "is", "it",
    "me", "missing", "my", "need", "of", "on", "or", "please", "should", "that",
    "the", "this", "to", "what", "with", "you",
}


class RecallNoMatch(LookupError):
    """No stored skill matches the query (never invent an answer)."""

    def __init__(self, message: str, available: list[str]):
        super().__init__(message)
        self.available = available


def _tokens(value: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9]+", value.lower())
        if len(t) > 2 and t not in STOPWORDS
    }


def _normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _matches(item_name: str, aliases: list[str], have: list[str]) -> bool:
    item_keys = {_normalize(item_name), *(_normalize(a) for a in aliases)}
    for raw in have:
        candidate = _normalize(raw)
        if not candidate:
            continue
        for key in item_keys:
            if not key:
                continue
            if candidate == key:
                return True
            # Conservative containment: "passport copy" confirms "passport",
            # but only for keys long enough to avoid accidental matches.
            if len(candidate) >= 4 and len(key) >= 4 and (candidate in key or key in candidate):
                return True
    return False


def _skill_tokens(skill: Skill) -> set[str]:
    parts = [skill.title, skill.summary or "", skill.type.value, *(i.name for i in skill.items)]
    for item in skill.items:
        parts.extend(item.aliases)
    parts.extend(step.instruction for step in skill.steps)
    tokens: set[str] = set()
    for part in parts:
        tokens |= _tokens(part)
    return tokens


def recall_for_reader(reader_id: str, query: str, have: list[str]) -> RecallResponse:
    query_terms = _tokens(query)
    if not query_terms:
        raise RecallNoMatch("Add a few descriptive words to the query.", [])

    skills = get_store().list_skills_for_reader(reader_id)
    best: tuple[int, Skill, set[str]] | None = None
    for skill in skills:
        overlap = query_terms & _skill_tokens(skill)
        if not overlap:
            continue
        score = len(overlap)
        if best is None or score > best[0]:
            best = (score, skill, overlap)

    if best is None:
        titles = [s.title for s in skills[:5]]
        raise RecallNoMatch(
            "No stored skill matches that query, so ONCE will not invent an answer.",
            titles,
        )

    _, skill, matched = best
    missing = [
        RecallMissingItem(name=item.name, aliases=item.aliases)
        for item in skill.items
        if item.required and not _matches(item.name, item.aliases, have)
    ]
    unconfirmed = [
        item.name
        for item in skill.items
        if not _matches(item.name, item.aliases, have)
    ]
    explanation = (
        f"Matched “{skill.title}” (v{skill.version}) on: {', '.join(sorted(matched))}. "
        f"{len(have)} item(s) confirmed present; "
        f"{len(missing)} required item(s) are not confirmed. "
        "Not confirmed is not proof of absence — check the bag before leaving."
    )
    return RecallResponse(
        skill=skill,
        query=query,
        matched_terms=sorted(matched),
        have=have,
        missing=missing,
        unconfirmed=unconfirmed,
        explanation=explanation,
    )
