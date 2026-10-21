"""Skill + learner-session endpoints.

Authorization rule (server-side, non-negotiable):
- GET/list    owner or granted learner only
- UPDATE/share/DELETE  owner only
- sessions    learner-scoped, keyed by the requesting learner_id
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.models.api import (
    CreateSkillRequest,
    ListSkillsResponse,
    NextStepResponse,
    StartSessionRequest,
    UpdateSkillRequest,
    VerifyStepResponse,
)
from app.models.core import (
    ItemVerification,
    LearnerSession,
    LearnerStepState,
    Skill,
    SkillItem,
    SkillSource,
    SkillStep,
    SkillType,
    Verdict,
    utcnow,
)
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
    return skill


@router.post("/skills/{skill_id}/share", response_model=Skill)
def share_skill(skill_id: str, owner_id: str, learner_id: str, revoke: bool = False) -> Skill:
    skill = get_store().share_skill(skill_id, owner_id, learner_id, revoke)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill not found or not owned")
    return skill


# ---------------------------------------------------------------------------
# Learner sessions (Coach/Verifier support; Coach logic itself lands with
# agent orchestration in Prompt 6 — these endpoints implement the stateful
# progression mechanically so guidance works today).
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=NextStepResponse, status_code=status.HTTP_201_CREATED)
def start_session(req: StartSessionRequest) -> NextStepResponse:
    store = get_store()
    skill = store.get_skill(req.skill_id, req.learner_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill not found or not accessible")
    open_sessions = [
        s for s in store.list_sessions_for_skill(req.skill_id, req.learner_id)
        if s.completed_at is None
    ]
    session = open_sessions[-1] if open_sessions else LearnerSession(
        session_id=uuid.uuid4().hex[:12],
        skill_id=skill.skill_id,
        skill_version=skill.version,
        learner_id=req.learner_id,
        step_states=[
            LearnerStepState(step_order=i) for i in range(len(skill.steps))
        ],
    )
    store.save_session(session)
    return _next_step_response(store, session)


@router.get("/sessions/{session_id}/next", response_model=NextStepResponse)
def next_step(session_id: str, learner_id: str) -> NextStepResponse:
    store = get_store()
    session = _require_session(store, session_id, learner_id)
    return _next_step_response(store, session)


@router.post("/sessions/{session_id}/verify", response_model=VerifyStepResponse)
def verify_step(session_id: str, learner_id: str, event: str, order: int) -> VerifyStepResponse:
    """Mechanical verifier: the learner's reported event must equal the step's
    expected_event, and on the right step. Multimodal verification arrives in
    Prompts 4–6; fabrication of results is never permitted.
    """
    store = get_store()
    session = _require_session(store, session_id, learner_id)
    skill = store.get_skill(session.skill_id, learner_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill disappeared mid-session")
    state = next((s for s in session.step_states if s.step_order == order), None)
    step = next((s for s in skill.steps if s.order == order), None)
    if state is None or step is None:
        raise HTTPException(status_code=400, detail="unknown step")
    order_sorted = sorted(s.order for s in skill.steps)
    current = session.current_step
    if order_sorted and order != current:
        verdict = Verdict.mismatch
        reason = f"expected step {current}, got step {order}"
    elif step.expected_event and event != step.expected_event:
        verdict = Verdict.mismatch
        reason = f"expected '{step.expected_event}', got '{event}'"
    else:
        verdict = Verdict.verified
        reason = "step completed"
        state.verified_at = datetime.now(timezone.utc)
        state.status = "verified"
        # advance to next pending step (skipped steps may allow jumping ahead)
        pending_orders = sorted(
            s.step_order for s in session.step_states if s.status == "pending"
        )
        session.current_step = pending_orders[0] if pending_orders else order
        if not pending_orders:
            session.completed_at = utcnow()
        store.save_session(session)
    return VerifyStepResponse(verdict=verdict, reason=reason, advanced=verdict == Verdict.verified)


def _require_session(store, session_id: str, learner_id: str) -> LearnerSession:
    session = store.get_session(session_id)
    if session is None or session.learner_id != learner_id:
        raise HTTPException(status_code=404, detail="session not found")
    return session


def _next_step_response(store, session: LearnerSession) -> NextStepResponse:
    skill = store.get_skill(session.skill_id, session.learner_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="skill not accessible")
    if session.completed_at is not None:
        return NextStepResponse(session_id=session.session_id, done=True)
    step = next((s for s in skill.steps if s.order == session.current_step), None)
    if step is None:
        order_sorted = sorted(s.order for s in skill.steps)
        if not order_sorted:
            return NextStepResponse(session_id=session.session_id, done=True)
        step = next((s for s in skill.steps if s.order == order_sorted[0]), None)
    return NextStepResponse(
        session_id=session.session_id,
        step_order=step.order if step else None,
        instruction=step.instruction if step else None,
        screen=step.screen,
        target_element_id=step.target_element_id,
    )
