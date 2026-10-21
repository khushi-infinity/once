"""DynamoDB-backed skill/session store (live mode).

Same interface as the in-memory store; no scans — queries only. Adds a GSI on
owner for list-by-owner without full-table reads.
"""
import uuid
from threading import Lock
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from app.config import get_settings
from app.models.core import LearnerSession, Skill, ShareGrant, utcnow

Lockable = Lock


def _resource():
    settings = get_settings()
    session = (
        boto3.Session(profile_name=settings.aws_profile) if settings.aws_profile else boto3.Session()
    )
    return session.resource("dynamodb", region_name=settings.aws_region)


def _to_plain(value: Any) -> Any:
    """Convert a Pydantic-serialized dict's datetimes to plain types for DynamoDB."""
    return value


class DynamoSkillStore:
    def __init__(self) -> None:
        res = _resource()
        settings = get_settings()
        self._skills = res.Table(settings.dynamodb_skills_table)
        self._sessions = res.Table(settings.dynamodb_sessions_table)

    # -- skills ---------------------------------------------------------------
    def create_skill(self, skill: Skill) -> Skill:
        item = skill.model_dump(mode="json")
        item["skillId"] = skill.skill_id  # table key (snake_case field is skill_id)
        item["ownerId"] = skill.owner_id  # GSI partition key
        try:
            self._skills.put_item(Item=item, ConditionExpression="attribute_not_exists(skillId)")
        except self._skills.meta.client.exceptions.ConditionalCheckFailedException as exc:
            raise ValueError(f"skill exists: {skill.skill_id}") from exc
        return skill

    def get_skill(self, skill_id: str, reader_id: str) -> Skill | None:
        resp = self._skills.get_item(Key={"skillId": skill_id})
        raw = resp.get("Item")
        if raw is None:
            return None
        raw.pop("ownerId", None)
        raw.pop("skillId", None)
        skill = Skill.model_validate(raw)
        if reader_id not in skill.authorized_reader_ids():
            return None
        return skill

    def list_skills_for_reader(self, reader_id: str) -> list[Skill]:
        by_id: dict[str, Skill] = {}
        # owned skills via GSI
        paginator = self._skills.meta.client.get_paginator("query")
        for page in paginator.paginate(
            TableName=get_settings().dynamodb_skills_table,
            IndexName="owner-index",
            KeyConditionExpression="ownerId = :r",
            ExpressionAttributeValues={":r": reader_id},
        ):
            for raw in page.get("Items", []):
                item = dict(raw)
                item.pop("ownerId", None)
                item.pop("skillId", None)
                s = Skill.model_validate(item)
                by_id[s.skill_id] = s
        # shared-to-learner reaches here via the share-grants field on the
        # owning record; the Memory agent (Prompt 4/6) adds a grants GSI for
        # learner-side listing. Today, shared skills surface through teach UI
        # or MCP lookup by id with the learner check done on read.
        return sorted(by_id.values(), key=lambda s: s.created_at)

    def delete_skill(self, skill_id: str, owner_id: str) -> bool:
        from boto3.dynamodb.conditions import Attr

        try:
            resp = self._skills.delete_item(
                Key={"skillId": skill_id},
                ConditionExpression=Attr("ownerId").eq(owner_id),
                ReturnValues="ALL_OLD",
            )
        except self._skills.meta.client.exceptions.ConditionalCheckFailedException:
            return False
        return "OldImage" in resp

    def share_skill(
        self, skill_id: str, owner_id: str, learner_id: str, revoke: bool
    ) -> Skill | None:
        skill = self.get_skill(skill_id, owner_id)
        if skill is None or skill.owner_id != owner_id:
            return None
        existing = next((g for g in skill.share_grants if g.learner_id == learner_id), None)
        now = utcnow()
        if revoke:
            if existing:
                existing.revoked = True
        else:
            if existing:
                existing.revoked = False
                existing.granted_at = now
            else:
                skill.share_grants.append(ShareGrant(learner_id=learner_id, granted_by=owner_id))
            skill.visibility = "shared"
        self._update_skill(skill)
        return skill

    def update_skill_from_model(self, skill: Skill) -> Skill:
        self._update_skill(skill)
        return skill

    def _update_skill(self, skill: Skill) -> None:
        item = skill.model_dump(mode="json")
        item["skillId"] = skill.skill_id
        item["ownerId"] = skill.owner_id
        item["updatedAt"] = utcnow().isoformat()
        self._skills.put_item(Item=item)

    # -- sessions -------------------------------------------------------------
    def save_session(self, session: LearnerSession) -> LearnerSession:
        item = session.model_dump(mode="json")
        item["sessionId"] = session.session_id  # table key
        item["skillLearner"] = f"{session.skill_id}#{session.learner_id}"  # for resumption queries
        self._sessions.put_item(Item=item)
        return session

    def get_session(self, session_id: str) -> LearnerSession | None:
        resp = self._sessions.get_item(Key={"sessionId": session_id})
        raw = resp.get("Item")
        if raw is None:
            return None
        raw.pop("skillLearner", None)
        raw.pop("sessionId", None)
        return LearnerSession.model_validate(raw)

    def list_sessions_for_skill(self, skill_id: str, learner_id: str) -> list[LearnerSession]:
        resp = self._sessions.query(
            IndexName="skill-learner-index",
            KeyConditionExpression=Key("skillLearner").eq(f"{skill_id}#{learner_id}"),
        )
        sessions = []
        for raw in resp.get("Items", []):
            item = dict(raw)
            item.pop("skillLearner", None)
            item.pop("sessionId", None)
            sessions.append(LearnerSession.model_validate(item))
        return sorted(sessions, key=lambda s: s.started_at)
