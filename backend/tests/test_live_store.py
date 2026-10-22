"""Live-mode store tests. Only run when the active app configuration is live:

    cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest tests/test_live_store.py -q

These create and delete their own test records; they never touch user data.
"""
import os
import uuid

import pytest

from app.config import get_settings

pytestmark = pytest.mark.skipif(
    not (get_settings().is_live or os.environ.get("APP_MODE") == "live"),
    reason="live-only test",
)


@pytest.fixture()
def store():
    from app.services.dynamo_store import DynamoSkillStore
    from app.services.skill_store import get_store

    s = get_store()
    assert isinstance(s, DynamoSkillStore), "live test must run against DynamoDB"
    return s


def _skill(sid: str):
    from app.models.core import Skill, SkillItem, SkillSource, SkillType

    return Skill(
        skill_id=sid,
        owner_id="pytest-live",
        title=f"Live test {sid}",
        type=SkillType.packing,
        source=SkillSource.text,
        items=[SkillItem(name="Charger", aliases=["phone charger"])],
    )


def test_dynamo_skill_roundtrip_and_authz(store):
    sid = f"pytest-{uuid.uuid4().hex[:10]}"
    skill = store.create_skill(_skill(sid))
    assert skill.title.startswith("Live test")

    got = store.get_skill(sid, "pytest-live")
    assert got is not None and got.items[0].name == "Charger"
    # stranger cannot read
    assert store.get_skill(sid, "stranger") is None
    # share -> learner reads; revoke -> learner blocked
    store.share_skill(sid, "pytest-live", "learner-b", revoke=False)
    assert store.get_skill(sid, "learner-b") is not None
    store.share_skill(sid, "pytest-live", "learner-b", revoke=True)
    assert store.get_skill(sid, "learner-b") is None
    # owner delete works and reports success; stranger delete does not.
    assert store.delete_skill(sid, "stranger") is False
    assert store.delete_skill(sid, "pytest-live") is True
    assert store.get_skill(sid, "pytest-live") is None


def test_dynamo_session_roundtrip(store):
    from app.models.core import LearnerSession, LearnerStepState

    sid = f"pytest-{uuid.uuid4().hex[:10]}"
    skill_id = f"pskill-{uuid.uuid4().hex[:10]}"
    sk = store.create_skill(_skill(skill_id))
    sess = LearnerSession(
        session_id=sid,
        skill_id=sk.skill_id,
        skill_version=1,
        learner_id="pytest-live",
        step_states=[LearnerStepState(step_order=0)],
    )
    store.save_session(sess)
    back = store.get_session(sid)
    assert back is not None and back.learner_id == "pytest-live"
    assert store.list_sessions_for_skill(sk.skill_id, "pytest-live")
    store.delete_skill(sk.skill_id, "pytest-live")
