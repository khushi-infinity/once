"""Skill + learner-session persistence.

Prompt 1 ships an in-memory implementation so the whole teach→save→retrieve
flow runs end-to-end with zero cloud dependencies. Prompt 2 replaces this with
a DynamoDB implementation behind the SAME interface, nobody downstream may
reach around this module.
"""
import uuid
from threading import Lock

from app.config import get_settings
from app.models.core import LearnerSession, Skill

Lockable = Lock


class SkillStore:
    """Interface: create / get / list_for_reader / update / delete / share."""

    def create_skill(self, skill: Skill) -> Skill:
        raise NotImplementedError

    def get_skill(self, skill_id: str, reader_id: str) -> Skill | None:
        """Returns skill only if reader is owner or holds a live share grant."""

    def list_skills_for_reader(self, reader_id: str) -> list[Skill]:
        raise NotImplementedError

    def delete_skill(self, skill_id: str, owner_id: str) -> bool:
        raise NotImplementedError

    def share_skill(self, skill_id: str, owner_id: str, learner_id: str, revoke: bool) -> Skill | None:
        raise NotImplementedError

    def update_skill_from_model(self, skill: Skill) -> Skill:
        """Persist the full mutation submitted through the domain model.

        Callers fetch -> mutate -> call this; the live store must write the
        record (generates its updatedAt stamp server-side where relevant).
        """
        raise NotImplementedError

    def save_session(self, session: LearnerSession) -> LearnerSession:
        raise NotImplementedError

    def get_session(self, session_id: str) -> LearnerSession | None:
        raise NotImplementedError

    def list_sessions_for_skill(self, skill_id: str, learner_id: str) -> list[LearnerSession]:
        raise NotImplementedError


class InMemorySkillStore(SkillStore):
    def __init__(self, seed_demo: bool = True) -> None:
        self._skills: dict[str, Skill] = {}
        self._sessions: dict[str, LearnerSession] = {}
        self._lock = Lockable()
        if seed_demo:
            from app.services.demo_seed import seed_demo_skills

            seed_demo_skills(self)

    def create_skill(self, skill: Skill) -> Skill:
        with self._lock:
            if skill.skill_id in self._skills:
                raise ValueError(f"skill exists: {skill.skill_id}")
            self._skills[skill.skill_id] = skill
            return skill

    def get_skill(self, skill_id: str, reader_id: str) -> Skill | None:
        with self._lock:
            skill = self._skills.get(skill_id)
        if skill is None or reader_id not in skill.authorized_reader_ids():
            return None
        return skill

    def list_skills_for_reader(self, reader_id: str) -> list[Skill]:
        with self._lock:
            skills = list(self._skills.values())
        return [s for s in skills if reader_id in s.authorized_reader_ids()]

    def delete_skill(self, skill_id: str, owner_id: str) -> bool:
        with self._lock:
            skill = self._skills.get(skill_id)
        if skill is None or skill.owner_id != owner_id:
            return False
        with self._lock:
            self._skills.pop(skill_id, None)
        return True

    def share_skill(self, skill_id: str, owner_id: str, learner_id: str, revoke: bool) -> Skill | None:
        with self._lock:
            skill = self._skills.get(skill_id)
        if skill is None or skill.owner_id != owner_id:
            return None
        from app.models.core import ShareGrant, utcnow

        existing = next((g for g in skill.share_grants if g.learner_id == learner_id), None)
        if revoke:
            if existing:
                existing.revoked = True
        else:
            if existing:
                existing.revoked = False
                existing.granted_at = utcnow()
            else:
                skill.share_grants.append(
                    ShareGrant(learner_id=learner_id, granted_by=owner_id)
                )
            skill.visibility = "shared"
        return skill

    def save_session(self, session: LearnerSession) -> LearnerSession:
        session.updated_at = session.updated_at  # utcnow applied by caller on change
        self._sessions[session.session_id] = session
        return session

    def update_skill_from_model(self, skill: Skill) -> Skill:
        # In-memory mode shares the object reference, so assignment is honest.
        self._skills[skill.skill_id] = skill
        return skill

    def get_session(self, session_id: str) -> LearnerSession | None:
        return self._sessions.get(session_id)

    def list_sessions_for_skill(self, skill_id: str, learner_id: str) -> list[LearnerSession]:
        return sorted(
            (s for s in self._sessions.values() if s.skill_id == skill_id and s.learner_id == learner_id),
            key=lambda s: s.started_at,
        )


_store: SkillStore | None = None
_store_lock = Lockable()


def get_store() -> SkillStore:
    """Factory: mock mode -> in-memory; live mode -> DynamoDB.

    Never silently substitutes one for the other: the mode comes from
    APP_MODE and fails loudly if a live store cannot be opened.
    """
    global _store
    if _store is not None:
        return _store
    settings = get_settings()
    if settings.is_live:
        from app.services.dynamo_store import DynamoSkillStore

        _store = DynamoSkillStore()
    else:
        _store = InMemorySkillStore(seed_demo=settings.seed_demo)
    return _store


def new_skill_id() -> str:
    return uuid.uuid4().hex[:12]
