"""ONCE core data models.

These mirror the skill-record structure in PRODUCT_SPEC.md. DynamoDB storage
(Prompt 2) serializes/deserializes exactly these types, the models are the
single source of truth.
"""
from datetime import UTC, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(UTC)


class SkillType(str, Enum):
    packing = "packing"
    checklist = "checklist"
    household_procedure = "household_procedure"
    browser_workflow = "browser_workflow"


class SkillSource(str, Enum):
    voice = "voice"
    text = "text"
    photo = "photo"
    camera_demo = "camera_demo"
    screen_demo = "screen_demo"


# How well an item's packed-state is known. This tri-state (plus "not_started")
# is the core honesty rule from the plan: absence of visual evidence is NOT
# evidence of absence for packed items inside a closed bag.
class ItemVerification(str, Enum):
    confirmed_packed = "confirmed_packed"        # user explicitly confirmed
    visible_packed = "visible_packed"            # sensor saw it, user did not confirm
    explicitly_missing = "explicitly_missing"    # user said it is missing
    not_verified = "not_verified"                # nothing knows one way or the other


class SkillItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    required: bool = True
    aliases: list[str] = Field(default_factory=list)
    verification: ItemVerification = ItemVerification.not_verified
    evidence_s3_key: str | None = None  # reference into private S3, never the bytes


class SkillStep(BaseModel):
    order: int = Field(..., ge=0)
    instruction: str = Field(..., min_length=1, max_length=1000)
    # browser_workflow steps target a stable element id inside the controlled
    # PhotoShare demo app; other step types leave it None.
    target_element_id: str | None = None
    screen: str | None = None  # route or screen name the step occurs on
    checkpoint_s3_key: str | None = None
    expected_event: str | None = None  # e.g. "click", "file_selected", "message_sent"


class ShareGrant(BaseModel):
    learner_id: str = Field(..., min_length=1, max_length=64)
    granted_by: str
    granted_at: datetime = Field(default_factory=utcnow)
    revoked: bool = False


class Skill(BaseModel):
    skill_id: str = Field(..., min_length=1, max_length=64)
    owner_id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=300)
    type: SkillType
    version: int = 1
    source: SkillSource
    items: list[SkillItem] = Field(default_factory=list)
    steps: list[SkillStep] = Field(default_factory=list)
    visibility: Literal["private", "shared"] = "private"
    share_grants: list[ShareGrant] = Field(default_factory=list)
    summary: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def authorized_reader_ids(self) -> set[str]:
        """Owner plus holders of non-revoked share grants."""
        return {self.owner_id} | {
            g.learner_id for g in self.share_grants if not g.revoked
        }


class LearnerStepState(BaseModel):
    step_order: int
    verified_at: datetime | None = None
    status: Literal["pending", "verified", "mismatch", "skipped"] = "pending"


class LearnerSession(BaseModel):
    """Per-learner progress, stored separately from the taught Skill."""

    session_id: str
    skill_id: str
    skill_version: int
    learner_id: str
    current_step: int = 0
    step_states: list[LearnerStepState] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    completed_at: datetime | None = None


class Verdict(str, Enum):
    verified = "verified"
    mismatch = "mismatch"
    uncertain = "uncertain"


class VerificationResult(BaseModel):
    verdict: Verdict
    reason: str
    detected_items: list[str] = Field(default_factory=list)
    uncertain_items: list[str] = Field(default_factory=list)
