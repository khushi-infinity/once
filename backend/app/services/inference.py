"""Inference provider dispatcher.

Primary provider is Amazon Bedrock (Nova 2 Lite via Converse). While the AWS
account-level model-inference restriction documented in AWS_EVIDENCE.md is in
place, the backend can be run with INFERENCE_PROVIDER=gemini (free-tier Google
AI Studio). Rules, enforced here:

- no silent provider substitution: `settings.inference_provider` decides;
  failures surface as errors, never as output from a different provider;
- every result carries engine metadata (provider, model, duration, usage,
  request id where the service returns one) — this is the judge-visible proof;
- private images/prompts are never logged; only sanitized metadata.
"""
import base64
import json
import logging
import re
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

RETRYABLE = {429, 500, 502, 503, 504}


class InferenceResult:
    """Provider-neutral inference output + sanitized metadata."""

    def __init__(
        self,
        text: str,
        provider: str,
        model_id: str,
        duration_ms: int,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        request_id: str | None = None,
    ):
        self.text = text
        self.provider = provider
        self.model_id = model_id
        self.duration_ms = duration_ms
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.request_id = request_id

    @classmethod
    def from_bedrock(cls, bedrock_result, provider: str = "bedrock") -> "InferenceResult":
        meta = bedrock_result.metadata
        return cls(
            text=bedrock_result.text,
            provider=provider,
            model_id=meta.model_id,
            duration_ms=meta.duration_ms,
            input_tokens=meta.input_tokens,
            output_tokens=meta.output_tokens,
            request_id=meta.aws_request_id,
        )

    def metadata_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model_id,
            "duration_ms": self.duration_ms,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "request_id": self.request_id,
        }


class ProviderUnavailable(RuntimeError):
    """The configured inference provider is unreachable/entitled-blocked."""


# --------------------------------------------------------------------------
# Gemini (free-tier fallback) via REST — no new heavy dependency.
# --------------------------------------------------------------------------
_GEMINI_SYSTEM_SUFFIX = (
    "\nReturn ONLY a single JSON object and nothing else."
)


def _gemini_generate(user_text: str, system: str | None, image: tuple[bytes, str] | None) -> InferenceResult:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ProviderUnavailable(
            "GEMINI_API_KEY not configured (set it in backend/.env to use the "
            "labeled free-tier fallback); get one free at aistudio.google.com"
        )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model_id}:generateContent"
    )
    parts: list[dict] = []
    if image is not None:
        image_bytes, media_type = image
        parts.append({
            "inline_data": {
                "mime_type": media_type,
                "data": base64.b64encode(image_bytes).decode("ascii"),
            }
        })
    parts.append({"text": user_text})
    body: dict = {"contents": [{"role": "user", "parts": parts}], "safetySettings": []}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system + _GEMINI_SYSTEM_SUFFIX}]}
    body["generationConfig"] = {"responseMimeType": "application/json"}

    start = time.monotonic()
    for attempt in range(3):
        try:
            resp = httpx.post(
                url,
                params={"key": settings.gemini_api_key},
                json=body,
                timeout=30,
            )
            if resp.status_code in RETRYABLE and attempt < 2:
                time.sleep(2**attempt)
                continue
            resp.raise_for_status()
            break
        except (httpx.HTTPStatusError, httpx.TransportError) as exc:
            if attempt < 2 and getattr(exc, "response", None) and exc.response.status_code in RETRYABLE:
                time.sleep(2**attempt)
                continue
            raise ProviderUnavailable(f"gemini client error: {exc}") from exc

    duration_ms = int((time.monotonic() - start) * 1000)
    try:
        data = resp.json()
    except json.JSONDecodeError as exc:
        raise ProviderUnavailable("gemini returned non-JSON body") from exc
    usage = data.get("usageMetadata", {})
    text = "".join(
        part.get("text", "")
        for cand in data.get("candidates", [])
        for part in cand.get("content", {}).get("parts", [])
    )
    result = InferenceResult(
        text=text,
        provider="gemini",
        model_id=settings.gemini_model_id,
        duration_ms=duration_ms,
        input_tokens=usage.get("promptTokenCount"),
        output_tokens=usage.get("candidatesTokenCount"),
        request_id=resp.headers.get("x-goog-request-id"),
    )
    logger.info(
        "gemini_inference model=%s duration_ms=%d in=%s out=%s",
        result.model_id, result.duration_ms, result.input_tokens, result.output_tokens,
    )
    return result


def _gemini_extract(transcript: str, skill_type: str) -> InferenceResult:
    system = (
        "You extract structured procedures from a teacher's spoken description. "
        'Return ONLY JSON: {"title": str, "items": [{"name": str, "aliases": [str]}], '
        '"steps": [{"instruction": str}], "ambiguities": [str]}. '
        "Never invent items the teacher did not mention."
    )
    return _gemini_generate(f"Task type: {skill_type}\nTeacher said: {transcript}", system, None)


# --------------------------------------------------------------------------
# Shared JSON parsing for extraction results
# --------------------------------------------------------------------------
def parse_json_object(text: str) -> dict[str, Any]:
    """Pull one JSON object out of a model reply (tolerates code fences)."""
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("model reply contained no JSON object")
    return json.loads(cleaned[start : end + 1])


# --------------------------------------------------------------------------
# Public, provider-agnostic surface — consumers call these, never a provider.
# --------------------------------------------------------------------------
def analyze_text(prompt: str, system: str | None = None) -> InferenceResult:
    settings = get_settings()
    if settings.inference_provider == "gemini":
        return _gemini_generate(prompt, system, None)
    if settings.inference_provider == "bedrock":
        from app.services.bedrock import analyze_text as bedrock_analyze_text

        return InferenceResult.from_bedrock(bedrock_analyze_text(prompt, system))
    raise ProviderUnavailable(f"unknown INFERENCE_PROVIDER: {settings.inference_provider}")


def analyze_image(image_bytes: bytes, media_type: str, prompt: str) -> InferenceResult:
    settings = get_settings()
    if settings.inference_provider == "gemini":
        return _gemini_generate(prompt, None, (image_bytes, media_type))
    if settings.inference_provider == "bedrock":
        from app.services.bedrock import analyze_image as bedrock_analyze_image

        return InferenceResult.from_bedrock(bedrock_analyze_image(image_bytes, media_type, prompt))
    raise ProviderUnavailable(f"unknown INFERENCE_PROVIDER: {settings.inference_provider}")


def extract_procedure(transcript: str, skill_type: str = "packing") -> InferenceResult:
    settings = get_settings()
    if settings.inference_provider == "gemini":
        return _gemini_extract(transcript, skill_type)
    if settings.inference_provider == "bedrock":
        from app.services.bedrock import extract_procedure as bedrock_extract

        return InferenceResult.from_bedrock(bedrock_extract(transcript, skill_type))
    raise ProviderUnavailable(f"unknown INFERENCE_PROVIDER: {settings.inference_provider}")
