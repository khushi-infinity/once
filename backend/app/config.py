"""ONCE backend configuration.

All live AWS wiring lands in Prompt 2; APP_MODE gates it explicitly.
Mock mode must be *opt-in and visible*: the backend never silently fakes AWS results.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Application mode ---------------------------------------------------
    # "mock": in-memory stores and stubbed AI calls (tests / offline dev).
    # "live": real AWS calls required; failures surface as errors, never as fakes.
    app_mode: str = "mock"

    # --- AWS (used only when app_mode == "live") -----------------------------
    aws_region: str = "us-east-1"
    aws_profile: str = ""  # optional named profile; default chain when empty
    bedrock_model_id: str = "us.amazon.nova-2-lite-v1:0"  # US inference profile
    dynamodb_skills_table: str = "ONCE_Skills"
    dynamodb_sessions_table: str = "ONCE_Sessions"
    s3_evidence_bucket: str = "once-evidence-552952091217"

    # --- Backend -------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    # --- Inference provider ---------------------------------------------------
    # "bedrock": Amazon Bedrock Runtime via Converse (primary; AWS account has
    #   an active restriction on model inference — see AWS_EVIDENCE.md).
    # "gemini": free-tier Google AI Studio fallback, used ONLY by explicit
    #   choice while the Bedrock restriction persists (never auto-selected,
    #   always labeled in API responses and UI).
    inference_provider: str = "bedrock"
    gemini_api_key: str = ""
    gemini_model_id: str = "gemini-2.5-flash-lite"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o for o in (s.strip() for s in self.cors_origins.split(",")) if o]

    @property
    def is_live(self) -> bool:
        return self.app_mode == "live"


@lru_cache
def get_settings() -> Settings:
    return Settings()
