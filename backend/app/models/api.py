"""HTTP API contracts. Frontend and backend agree on exactly these shapes."""
from typing import Literal

from pydantic import BaseModel, Field

from app.models.core import Skill, SkillSource, SkillType, Verdict


class HealthResponse(BaseModel):
    status: Literal["ok"]
    app_mode: str
    version: str


class CreateSkillRequest(BaseModel):
    owner_id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=300)
    type: SkillType
    source: SkillSource
    summary: str | None = None


class UpdateSkillRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    summary: str | None = None
    # Full replacement of items/steps on update; bumping version is server-side.
    items: list | None = None
    steps: list | None = None


class ShareRequest(BaseModel):
    learner_id: str = Field(..., min_length=1, max_length=64)
    revoke: bool = False


class ListSkillsResponse(BaseModel):
    skills: list[Skill]
    ownerIds: list[str] = Field(alias="owner_ids")


class StartSessionRequest(BaseModel):
    skill_id: str
    learner_id: str


class NextStepResponse(BaseModel):
    session_id: str
    done: bool = False
    step_order: int | None = None
    instruction: str | None = None
    screen: str | None = None
    target_element_id: str | None = None


class VerifyStepResponse(BaseModel):
    verdict: Verdict
    reason: str
    advanced: bool = False


class ErrorResponse(BaseModel):
    detail: str
