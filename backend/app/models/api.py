"""HTTP API contracts. Frontend and backend agree on exactly these shapes."""
from typing import Literal

from pydantic import BaseModel, Field

from app.models.core import Skill, SkillSource, SkillType, Verdict


class InferenceStatus(BaseModel):
    provider: str
    model: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    app_mode: str
    version: str
    inference: InferenceStatus


class CreateSkillRequest(BaseModel):
    owner_id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=300)
    type: SkillType
    source: SkillSource
    summary: str | None = None
    # Draft content confirmed by the teacher (extraction flow); the human
    # approval happens client-side before this endpoint is called.
    items: "list[SkillItemRow] | None" = None
    steps: "list[StepRow] | None" = None


class SkillItemRow(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    required: bool = True
    aliases: list[str] = Field(default_factory=list)


class StepRow(BaseModel):
    order: int = Field(..., ge=0)
    instruction: str = Field(..., min_length=1, max_length=1000)
    target_element_id: str | None = None
    screen: str | None = None
    expected_event: str | None = None


# Resolve the forward references used above (classes defined after the request).
CreateSkillRequest.model_rebuild()


class TeachExtractRequest(BaseModel):
    transcript: str = Field(..., min_length=3, max_length=8000)
    skill_type: SkillType = SkillType.packing
    source: SkillSource = SkillSource.text


class DraftEngine(BaseModel):
    provider: str
    model: str | None = None
    duration_ms: int | None = None
    request_id: str | None = None


class TeachExtractResponse(BaseModel):
    title: str
    summary: str | None = None
    items: list[SkillItemRow] = Field(default_factory=list)
    steps: list[StepRow] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    # What produced this draft — surfaced so the teacher (and judges) can see
    # whether real AI extraction or the labeled deterministic mock ran.
    engine: DraftEngine


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
