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
    # Mock mode is offline dev/demo. Seed the curated demo skills so /alexa
    # works without AWS; this is clearly labeled by /health. Set to false for an
    # empty in-memory store in tests that need a blank slate.
    seed_demo: bool = True

    # --- AWS (used only when app_mode == "live") -----------------------------
    aws_region: str = "us-east-1"
    aws_profile: str = ""  # optional named profile; default chain when empty
    dynamodb_skills_table: str = "ONCE_Skills"
    dynamodb_sessions_table: str = "ONCE_Sessions"
    dynamodb_grants_table: str = "ONCE_Grants"
    s3_evidence_bucket: str = "once-evidence-552952091217"

    # --- Backend -------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"
    # MCP Streamable HTTP host/origin allowlist. Empty values disable DNS
    # rebinding checks (useful for a public, authless MCP endpoint); set these
    # to the deployed host and web origin to keep the check on.
    mcp_allowed_hosts: str = "localhost:*,127.0.0.1:*"
    mcp_allowed_origins: str = ""

    # --- AI inference --------------------------------------------------------
    # Chosen explicitly, never auto-switched; surfaced in /health and every
    # extraction response. "openai-compatible" works with a local Ollama server
    # or any hosted OpenAI-compatible endpoint. "openrouter" is the hosted
    # OpenAI-compatible path used for deployment. A fallback provider may be
    # configured explicitly; if it runs, engine metadata names the fallback.
    inference_provider: str = "openai-compatible"
    inference_fallback_provider: str = ""
    # Bound output so OpenRouter's credit preflight does not reject a request
    # that would otherwise fit. 2048 is enough for one draft or window answer.
    inference_max_tokens: int = 2048
    openai_base_url: str = "http://localhost:11434/v1"
    openai_api_key: str = "ollama"
    openai_model: str = "qwen2.5-coder:7b"
    # Separate model for photos (must be vision-capable). Empty = same as openai_model.
    openai_vision_model: str = ""
    # Google AI Studio (free tier) via the Interactions API. Gemini 3.8 Flash is
    # the primary model; 3.5 Flash-Lite is used only when the primary reports a
    # retryable model/availability error. A 403 account-level denial is surfaced
    # immediately, never hidden behind a fallback.
    gemini_api_key: str = ""
    gemini_model_id: str = "gemini-3.8-flash"
    gemini_fallback_model_id: str = "gemini-3.5-flash-lite"
    # OpenRouter is OpenAI-compatible but has its own base URL, key and model
    # ids. It is the deployable cloud path when the Google project is blocked.
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-3.8-flash"
    openrouter_vision_model: str = "google/gemini-3.8-flash"

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
