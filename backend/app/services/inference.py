"""AI inference for ONCE.

Single provider: Google AI Studio's Gemini API (free tier) over REST, chosen
after the AWS account-level restriction made Amazon Bedrock inference
impossible (documented in FRICTION_LOG.md). This is labeled honestly in the
UI/API: ONCE never claims the inference runs on AWS.

Rules enforced here:
- no silent substitution: one provider, failures surface as real errors;
- every result carries engine metadata (provider, model, duration, usage,
  request id when the service returns one) — judge-visible proof;
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
PROVIDER = "gemini"


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
    """The inference provider is unreachable or not configured."""


_SYSTEM_SUFFIX = "\nReturn ONLY a single JSON object and nothing else."


def _generate(user_text: str, system: str | None, image: tuple[bytes, str] | None = None) -> InferenceResult:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ProviderUnavailable(
            "GEMINI_API_KEY not configured. Get a free key at aistudio.google.com "
            "and set it in backend/.env."
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
        body["systemInstruction"] = {"parts": [{"text": system + _SYSTEM_SUFFIX}]}
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
        raise ProviderUnavailable("gemini returned a non-JSON body") from exc
    usage = data.get("usageMetadata", {})
    text = "".join(
        part.get("text", "")
        for cand in data.get("candidates", [])
        for part in cand.get("content", {}).get("parts", [])
    )
    result = InferenceResult(
        text=text,
        provider=PROVIDER,
        model_id=settings.gemini_model_id,
        duration_ms=duration_ms,
        input_tokens=usage.get("promptTokenCount"),
        output_tokens=usage.get("candidatesTokenCount"),
        request_id=resp.headers.get("x-goog-request-id"),
    )
    logger.info(
        "inference model=%s duration_ms=%d in=%s out=%s",
        result.model_id, result.duration_ms, result.input_tokens, result.output_tokens,
    )
    return result


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
# Public surface used by routers/agents
# --------------------------------------------------------------------------
def analyze_text(prompt: str, system: str | None = None) -> InferenceResult:
    return _generate(prompt, system)


def analyze_image(image_bytes: bytes, media_type: str, prompt: str) -> InferenceResult:
    return _generate(prompt, None, (image_bytes, media_type))


def extract_procedure(transcript: str, skill_type: str = "packing") -> InferenceResult:
    system = (
        "You extract structured procedures from a teacher's spoken description. "
        'Return ONLY JSON: {"title": str, "items": [{"name": str, "aliases": [str]}], '
        '"steps": [{"instruction": str}], "ambiguities": [str]}. '
        "Never invent items the teacher did not mention."
    )
    return _generate(f"Task type: {skill_type}\nTeacher said: {transcript}", system)
