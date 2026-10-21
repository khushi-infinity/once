"""Learner-session engine shared by the HTTP API and the MCP server.

State progression is mechanical and server-side: a wrong event, wrong step or
wrong DOM element never advances the session. The Coach/verifier agents may
add richer checks later, but they cannot bypass these rules.
"""
import uuid
from datetime import UTC, datetime

from app.models.api import NextStepResponse, VerifyStepResponse
from app.models.core import LearnerSession, LearnerStepState, Verdict, utcnow
from app.services.skill_store import get_store


class LearningError(Exception):
    def __init__(self, detail: str, status_code: int = 404):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def start_session(skill_id: str, learner_id: str) -> NextStepResponse:
    store = get_store()
    skill = store.get_skill(skill_id, learner_id)
    if skill is None:
        raise LearningError("skill not found or not accessible")
    open_sessions = [
        s for s in store.list_sessions_for_skill(skill_id, learner_id)
        if s.completed_at is None
    ]
    session = open_sessions[-1] if open_sessions else LearnerSession(
        session_id=uuid.uuid4().hex[:12],
        skill_id=skill.skill_id,
        skill_version=skill.version,
        learner_id=learner_id,
        step_states=[LearnerStepState(step_order=i) for i in range(len(skill.steps))],
    )
    store.save_session(session)
    return _next_step_response(store, session)


def get_next_step(session_id: str, learner_id: str) -> NextStepResponse:
    store = get_store()
    session = _require_session(store, session_id, learner_id)
    return _next_step_response(store, session)


def verify_step(
    session_id: str,
    learner_id: str,
    event: str,
    order: int,
    element_id: str | None = None,
) -> VerifyStepResponse:
    store = get_store()
    session = _require_session(store, session_id, learner_id)
    skill = store.get_skill(session.skill_id, learner_id)
    if skill is None:
        raise LearningError("skill disappeared mid-session")
    state = next((s for s in session.step_states if s.step_order == order), None)
    step = next((s for s in skill.steps if s.order == order), None)
    if state is None or step is None:
        raise LearningError("unknown step", status_code=400)
    order_sorted = sorted(s.order for s in skill.steps)
    current = session.current_step
    if order_sorted and order != current:
        verdict = Verdict.mismatch
        reason = f"expected step {current}, got step {order}"
    elif step.expected_event and event != step.expected_event:
        verdict = Verdict.mismatch
        reason = f"expected '{step.expected_event}', got '{event}'"
    elif step.target_element_id and element_id != step.target_element_id:
        verdict = Verdict.mismatch
        reason = f"expected element '{step.target_element_id}', got '{element_id or 'nothing'}'"
    else:
        verdict = Verdict.verified
        reason = "step completed"
        state.verified_at = datetime.now(UTC)
        state.status = "verified"
        pending_orders = sorted(
            s.step_order for s in session.step_states if s.status == "pending"
        )
        session.current_step = pending_orders[0] if pending_orders else order
        if not pending_orders:
            session.completed_at = utcnow()
        store.save_session(session)
    return VerifyStepResponse(
        verdict=verdict, reason=reason, advanced=verdict == Verdict.verified
    )


def _require_session(store, session_id: str, learner_id: str) -> LearnerSession:
    session = store.get_session(session_id)
    if session is None or session.learner_id != learner_id:
        raise LearningError("session not found")
    return session


def _next_step_response(store, session: LearnerSession) -> NextStepResponse:
    skill = store.get_skill(session.skill_id, session.learner_id)
    if skill is None:
        raise LearningError("skill not accessible")
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
