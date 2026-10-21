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
    dynamodb_skills_table: str = "ONCE_Skills"
    dynamodb_sessions_table: str = "ONCE_Sessions"
    s3_evidence_bucket: str = "once-evidence-552952091217"

    # --- Backend -------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    # --- AI inference --------------------------------------------------------
    # Google AI Studio (free tier). The AWS account-level restriction made
    # Bedrock inference impossible; ONCE uses this provider and labels it.
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
