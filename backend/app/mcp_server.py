"""ONCE MCP server — exposes the skill-memory tools to any MCP client.

Transport: Streamable HTTP (MCP spec 2025-11-25 or newer, negotiated by the
official SDK). `app.main` mounts this app at `/mcp`, so the normal app needs no
second process. For the independent smoke client, run the standalone server:

    cd backend && uv run python -m app.mcp_server   # http://127.0.0.1:8765/mcp

Tools read/write the same stores as the HTTP API, with the same server-side
authorization checks. There is no privileged bypass.

Verified by scripts/mcp_smoke.py with an independent MCP client: it performs
initialize, lists tools, and calls them over Streamable HTTP.
"""
from mcp.server.mcpserver import MCPServer

from app.config import get_settings
from app.models.api import NextStepResponse, VerifyStepResponse
from app.models.core import Skill
from app.services import inference, learning
from app.services.drafting import deterministic_extract, draft_from_result
from app.services.recall import RecallNoMatch, recall_for_reader
from app.services.skill_store import get_store

mcp = MCPServer(
    "ONCE",
    instructions=(
        "ONCE is a personal skill-memory: it stores what a person taught "
        "(packing lists, procedures, browser workflows) and guides a learner "
        "through it. Answers are grounded in stored skills; when nothing "
        "matches, tools say so instead of inventing."
    ),
)


def _skill_dict(skill: Skill) -> dict:
    return skill.model_dump(mode="json")


@mcp.tool()
def once_list_skills(reader_id: str) -> list[dict]:
    """List skills the reader owns plus skills shared with them (owner-authorized)."""
    return [_skill_dict(s) for s in get_store().list_skills_for_reader(reader_id)]


@mcp.tool()
def once_get_skill(skill_id: str, reader_id: str) -> dict:
    """Fetch one skill by id if the reader owns it or holds a share grant."""
    skill = get_store().get_skill(skill_id, reader_id)
    if skill is None:
        return {"error": "skill not found or not accessible", "skill_id": skill_id}
    return _skill_dict(skill)


@mcp.tool()
def once_recall_missing(reader_id: str, query: str, have: list[str] | None = None) -> dict:
    """Grounded 'what am I missing?' — retrieves a stored skill and compares its
    required items with the names the reader confirms they already have.

    The response field is `not_confirmed`, because unconfirmed items are not
    proof of absence. Returns {"error": ...} when no stored skill matches, so
    callers can tell the user the truth instead of inventing an answer.
    """
    try:
        result = recall_for_reader(reader_id, query, have or [])
        return result.model_dump(mode="json")
    except RecallNoMatch as exc:
        return {"error": str(exc), "available_skills": exc.available}


@mcp.tool()
def once_start_session(
    skill_id: str, learner_id: str, restart: bool = False
) -> dict:
    """Start or resume a learner session; returns the next pending step.

    Set restart=true for a clean run; the default resumes the newest open
    session so a learner never loses progress.
    """
    try:
        return learning.start_session(
            skill_id, learner_id, restart=restart
        ).model_dump(mode="json")
    except learning.LearningError as exc:
        return {"error": exc.detail}


@mcp.tool()
def once_next_step(session_id: str, learner_id: str) -> dict:
    """Return the next pending step for this learner, or done=true."""
    try:
        return learning.get_next_step(session_id, learner_id).model_dump(mode="json")
    except learning.LearningError as exc:
        return {"error": exc.detail}


@mcp.tool()
def once_verify_step(
    session_id: str,
    learner_id: str,
    event: str,
    order: int,
    element_id: str | None = None,
) -> dict:
    """Verify a learner action. Wrong event, wrong step or wrong DOM element is a
    mismatch and does not advance the session."""
    try:
        result: VerifyStepResponse = learning.verify_step(
            session_id, learner_id, event, order, element_id
        )
        return result.model_dump(mode="json")
    except learning.LearningError as exc:
        return {"error": exc.detail}


@mcp.tool()
def once_extract_draft(transcript: str, skill_type: str = "packing") -> dict:
    """Turn a teacher's description into a structured draft (items + steps).
    The draft is a proposal only; persist it through the teacher-confirmed flow."""
    if not get_settings().is_live:
        draft = deterministic_extract(transcript, skill_type)
        return {
            "draft": draft.model_dump(mode="json"),
            "engine": draft.engine.model_dump(mode="json"),
        }
    try:
        result = inference.extract_procedure(transcript, skill_type)
        draft = draft_from_result(result)
        return {
            "draft": draft.model_dump(mode="json"),
            "engine": draft.engine.model_dump(mode="json"),
        }
    except Exception as exc:  # noqa: BLE001 — surfaced truthfully to the MCP caller
        return {"error": f"{type(exc).__name__}: {exc}"}


@mcp.tool()
def once_next_step_model_contract() -> dict:
    """Describe the NextStep contract for client builders (schema, not data)."""
    return NextStepResponse.model_json_schema()


def main() -> None:
    mcp.run("streamable-http", host="127.0.0.1", port=8765)


if __name__ == "__main__":
    main()
