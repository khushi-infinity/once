"""Skill + learner-session endpoints.

Authorization rule (server-side, non-negotiable):
- GET/list    owner or granted learner only
- UPDATE/share/DELETE  owner only
- sessions    learner-scoped, keyed by the requesting learner_id
"""
from fastapi import APIRouter, HTTPException, status

from app.models.api import (
    CreateSkillRequest,
    ListSkillsResponse,
    NextStepResponse,
    StartSessionRequest,
    UpdateSkillRequest,
    VerifyStepResponse,
)
from app.models.core import Skill, SkillItem, SkillStep, utcnow
from app.services import learning
from app.services.skill_store import get_store, new_skill_id

router = APIRouter(prefix="/api", tags=["skills"])


@router.post("/skills", response_model=Skill, status_code=status.HTTP_201_CREATED)
def create_skill(req: CreateSkillRequest) -> Skill:
    return get_store().create_skill(
        Skill(
            skill_id=new_skill_id(),
            owner_id=req.owner_id,
            title=req.title,
            type=req.type,
            source=req.source,
            summary=req.summary,
            items=[
                SkillItem(
                    name=item.name,
                    required=item.required,
                    aliases=item.aliases,
                )
                for item in (req.items or [])
            ],
            steps=[
                SkillStep(
                    order=step.order,
                    instruction=step.instruction,
                    target_element_id=step.target_element_id,
                    screen=step.screen,
                    expected_event=step.expected_event,
                )
                for step in (req.steps or [])
            ],
        )
    )


@router.get("/skills", response_model=ListSkillsResponse)
def list_skills(reader_id: str) -> ListSkillsResponse:
    """Lists skills the reader owns plus skills shared to them ("My memories & skills")."""
    return ListSkillsResponse(
        skills=get_store().list_skills_for_reader(reader_id),
        owner_ids=[reader_id],
    )


@router.get("/skills/{skill_id}", response_model=Skill)
def get_skill(skill_id: str, reader_id: str) -> Skill:
    skill = get_store().get_skill(skill_id, reader_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill not found or not accessible")
    return skill


@router.delete("/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill(skill_id: str, owner_id: str) -> None:
    if not get_store().delete_skill(skill_id, owner_id):
        raise HTTPException(status_code=404, detail="skill not found or not owned")


@router.patch("/skills/{skill_id}", response_model=Skill)
def update_skill(skill_id: str, req: UpdateSkillRequest, owner_id: str) -> Skill:
    skill = get_store().get_skill(skill_id, owner_id)
    if skill is None or skill.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="skill not found or not owned")
    # Version bump: a revision never silently destroys the approved original.
    skill.version += 1
    if req.title is not None:
        skill.title = req.title
    if req.summary is not None:
        skill.summary = req.summary
    if req.items is not None:
        skill.items = [SkillItem(**item) for item in req.items]
    if req.steps is not None:
        skill.steps = [SkillStep(**step) for step in req.steps]
    skill.updated_at = utcnow()
    # Persist for real in every mode — get_skill returns a fresh object in
    # DynamoDB mode, so the mutation must be written back explicitly.
    return get_store().update_skill_from_model(skill)


@router.post("/skills/{skill_id}/share", response_model=Skill)
def share_skill(skill_id: str, owner_id: str, learner_id: str, revoke: bool = False) -> Skill:
    skill = get_store().share_skill(skill_id, owner_id, learner_id, revoke)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill not found or not owned")
    return skill


# ---------------------------------------------------------------------------
# Learner sessions (mechanical progression; logic shared with the MCP server)
# ---------------------------------------------------------------------------
@router.post("/sessions", response_model=NextStepResponse, status_code=status.HTTP_201_CREATED)
def start_session(req: StartSessionRequest) -> NextStepResponse:
    try:
        return learning.start_session(req.skill_id, req.learner_id, restart=req.restart)
    except learning.LearningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/sessions/{session_id}/next", response_model=NextStepResponse)
def next_step(session_id: str, learner_id: str) -> NextStepResponse:
    try:
        return learning.get_next_step(session_id, learner_id)
    except learning.LearningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/sessions/{session_id}/verify", response_model=VerifyStepResponse)
def verify_step(
    session_id: str,
    learner_id: str,
    event: str,
    order: int,
    element_id: str | None = None,
) -> VerifyStepResponse:
    """The learner's event must match the step, and — for browser workflows —
    the recorded DOM element. A mismatch never advances the session.
    """
    try:
        return learning.verify_step(session_id, learner_id, event, order, element_id)
    except learning.LearningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
