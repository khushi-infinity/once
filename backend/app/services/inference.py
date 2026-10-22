"""AI inference for ONCE.

Two explicitly-selected providers, never auto-substituted:

- ``openai-compatible``, any OpenAI-compatible endpoint. Defaults to a local
  Ollama server, which is what the developer machine runs for the demo.
- ``openrouter``, OpenRouter's hosted OpenAI-compatible endpoint. It uses the
  same request shape but its own base URL, key and model ids.
- ``gemini``, Google AI Studio's Interactions API (free tier).

The provider is chosen with ``INFERENCE_PROVIDER`` and is labeled in every
response (``engine``), ``/health`` and the UI. An optional
``INFERENCE_FALLBACK_PROVIDER`` may be configured. A fallback is never silent:
the result carries ``fallback_from`` and logs the primary failure. ONCE never
claims the inference runs on AWS: the AWS story is the verified data layer
(DynamoDB, S3, IAM).

Rules enforced here:
- one primary provider per request; a fallback runs only when it is explicitly
  configured and the primary reports a provider-level failure;
- every result carries sanitized engine metadata (provider, model, duration,
  token usage, request id, fallback_from when applicable);
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
PROVIDERS = {"openai-compatible", "openrouter", "gemini"}


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
        fallback_from: str | None = None,
    ):
        self.text = text
        self.provider = provider
        self.model_id = model_id
        self.duration_ms = duration_ms
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.request_id = request_id
        self.fallback_from = fallback_from

    def metadata_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model_id,
            "duration_ms": self.duration_ms,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "request_id": self.request_id,
            "fallback_from": self.fallback_from,
        }


class ProviderUnavailable(RuntimeError):
    """The inference provider is unreachable, misconfigured or refused access."""


_SYSTEM_SUFFIX = "\nReturn ONLY a single JSON object and nothing else."


def current_model_id() -> str:
    settings = get_settings()
    if settings.inference_provider == "gemini":
        return settings.gemini_model_id
    if settings.inference_provider == "openrouter":
        return settings.openrouter_model
    return settings.openai_model


def _error_detail(resp: httpx.Response) -> str:
    """Extract a short provider error message without leaking credentials."""
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001, error text is best-effort only
        return f"HTTP {resp.status_code}"
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err.get("status") or "provider error")[:300]
        if isinstance(err, str):
            return err[:300]
        if "message" in body:
            return str(body["message"])[:300]
    return f"HTTP {resp.status_code}"


def _post_with_retries(url: str, *, headers: dict, body: dict, timeout: float = 90) -> tuple[httpx.Response, int]:
    start = time.monotonic()
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            resp = httpx.post(url, headers=headers, json=body, timeout=timeout)
            if resp.status_code in RETRYABLE and attempt < 2:
                time.sleep(2**attempt)
                continue
            return resp, int((time.monotonic() - start) * 1000)
        except httpx.TransportError as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(2**attempt)
                continue
            raise ProviderUnavailable(f"provider unreachable: {exc}") from exc
    raise ProviderUnavailable(f"provider request failed: {last_exc}")


def _gemini_request(model: str, content: list[dict], system: str | None) -> tuple[httpx.Response, int]:
    settings = get_settings()
    body: dict[str, Any] = {
        "model": model,
        "input": content,
        "response_format": {"type": "text", "mime_type": "application/json"},
    }
    if system:
        body["system_instruction"] = system + _SYSTEM_SUFFIX
    return _post_with_retries(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        headers={
            "x-goog-api-key": settings.gemini_api_key,
            "content-type": "application/json",
        },
        body=body,
    )


def _generate_gemini(user_text: str, system: str | None, image: tuple[bytes, str] | None) -> InferenceResult:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ProviderUnavailable(
            "GEMINI_API_KEY is not configured. Add a free key to backend/.env "
            "(aistudio.google.com) or set INFERENCE_PROVIDER=openai-compatible."
        )
    content: list[dict] = [{"type": "text", "text": user_text}]
    if image is not None:
        image_bytes, media_type = image
        content.append({
            "type": "image",
            "data": base64.b64encode(image_bytes).decode("ascii"),
            "mime_type": media_type,
        })

    models = [settings.gemini_model_id]
    fallback = settings.gemini_fallback_model_id.strip()
    if fallback and fallback != settings.gemini_model_id:
        models.append(fallback)

    last_error: str | None = None
    for index, model in enumerate(models):
        resp, duration_ms = _gemini_request(model, content, system)
        if resp.status_code >= 400:
            last_error = (
                f"gemini refused the request with {model} "
                f"(HTTP {resp.status_code}): {_error_detail(resp)}"
            )
            # A model-specific availability error can use the fallback. An
            # account-level 401/403 is not retried: the fallback cannot fix it.
            if index == 0 and resp.status_code in {404, 429, 500, 502, 503, 504}:
                logger.warning("gemini primary %s unavailable; trying fallback", model)
                continue
            raise ProviderUnavailable(last_error)
        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise ProviderUnavailable("gemini returned a non-JSON body") from exc
        text = "".join(
            part.get("text", "")
            for step in data.get("steps", [])
            if step.get("type") == "model_output"
            for part in step.get("content", [])
            if part.get("type") == "text"
        ).strip()
        if not text:
            text = str(data.get("output_text") or data.get("text") or "").strip()
        if not text:
            raise ProviderUnavailable("gemini returned no text for the request")
        usage = data.get("usage", {})
        result = InferenceResult(
            text=text,
            provider="gemini",
            model_id=model,
            duration_ms=duration_ms,
            input_tokens=usage.get("total_input_tokens"),
            output_tokens=usage.get("total_output_tokens"),
            request_id=data.get("id") or resp.headers.get("x-goog-request-id"),
        )
        logger.info(
            "inference provider=gemini model=%s duration_ms=%d in=%s out=%s fallback=%s",
            result.model_id,
            result.duration_ms,
            result.input_tokens,
            result.output_tokens,
            index > 0,
        )
        return result
    raise ProviderUnavailable(last_error or "gemini request failed")


def _generate_openai_compatible(
    user_text: str,
    system: str | None,
    image: tuple[bytes, str] | None,
    model: str | None = None,
    provider: str = "openai-compatible",
) -> InferenceResult:
    settings = get_settings()
    if provider == "openrouter":
        base = settings.openrouter_base_url.rstrip("/")
        api_key = settings.openrouter_api_key or "not-needed"
        default_model = settings.openrouter_model
        vision_model = settings.openrouter_vision_model or default_model
        missing = "OPENROUTER_MODEL is not configured for the openrouter provider."
    else:
        base = settings.openai_base_url.rstrip("/")
        api_key = settings.openai_api_key or "not-needed"
        default_model = settings.openai_model
        vision_model = settings.openai_vision_model or default_model
        missing = "OPENAI_MODEL is not configured for the openai-compatible provider."

    if model:
        model_id = model
    elif image is not None:
        model_id = vision_model
    else:
        model_id = default_model
    if not model_id:
        raise ProviderUnavailable(missing)

    user_content: list[dict] = [{"type": "text", "text": user_text}]
    if image is not None:
        image_bytes, media_type = image
        data_url = f"data:{media_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        user_content.append({"type": "image_url", "image_url": {"url": data_url}})
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system + _SYSTEM_SUFFIX})
    messages.append({"role": "user", "content": user_content})
    body: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        "temperature": 0,
        "stream": False,
    }
    if settings.inference_max_tokens > 0:
        body["max_tokens"] = settings.inference_max_tokens
    resp, duration_ms = _post_with_retries(
        f"{base}/chat/completions",
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
        body=body,
    )
    if resp.status_code >= 400:
        raise ProviderUnavailable(
            f"{provider} provider refused the request (HTTP {resp.status_code}): {_error_detail(resp)}"
        )
    try:
        data = resp.json()
    except json.JSONDecodeError as exc:
        raise ProviderUnavailable(f"{provider} provider returned a non-JSON body") from exc
    try:
        text = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderUnavailable(f"{provider} provider returned an unexpected shape") from exc
    usage = data.get("usage") or {}
    result = InferenceResult(
        text=text,
        provider=provider,
        model_id=model_id,
        duration_ms=duration_ms,
        input_tokens=usage.get("prompt_tokens"),
        output_tokens=usage.get("completion_tokens"),
        request_id=data.get("id") or resp.headers.get("x-request-id"),
    )
    logger.info(
        "inference provider=%s model=%s duration_ms=%d in=%s out=%s",
        result.provider, result.model_id, result.duration_ms,
        result.input_tokens, result.output_tokens,
    )
    return result


def generate(
    user_text: str,
    system: str | None = None,
    image: tuple[bytes, str] | None = None,
    model: str | None = None,
) -> InferenceResult:
    """Public provider-neutral generation entry point.

    The caller must choose the provider explicitly through settings. This is
    used by the window guide; extraction has its own prompt builders above.
    """
    return _generate(user_text, system=system, image=image, model=model)


def _generate_one(
    provider: str,
    user_text: str,
    system: str | None,
    image: tuple[bytes, str] | None,
    model: str | None,
) -> InferenceResult:
    if provider == "gemini":
        return _generate_gemini(user_text, system, image)
    if provider in {"openai-compatible", "openrouter"}:
        return _generate_openai_compatible(user_text, system, image, model, provider=provider)
    raise ProviderUnavailable(
        f"Unknown inference provider {provider!r}; expected one of {sorted(PROVIDERS)}."
    )


def _generate(
    user_text: str,
    system: str | None = None,
    image: tuple[bytes, str] | None = None,
    model: str | None = None,
) -> InferenceResult:
    settings = get_settings()
    primary = settings.inference_provider
    if primary not in PROVIDERS:
        raise ProviderUnavailable(
            f"Unknown INFERENCE_PROVIDER={primary!r}; expected one of {sorted(PROVIDERS)}."
        )
    chain = [primary]
    fallback = settings.inference_fallback_provider.strip()
    if fallback:
        if fallback not in PROVIDERS:
            raise ProviderUnavailable(
                f"Unknown INFERENCE_FALLBACK_PROVIDER={fallback!r}; "
                f"expected one of {sorted(PROVIDERS)}."
            )
        if fallback != primary:
            chain.append(fallback)

    errors: list[str] = []
    for index, provider in enumerate(chain):
        try:
            result = _generate_one(provider, user_text, system, image, model)
            if index > 0:
                result.fallback_from = primary
            return result
        except ProviderUnavailable as exc:
            errors.append(f"{provider}: {exc}")
            if index + 1 < len(chain):
                logger.warning(
                    "inference primary provider=%s failed (%s); trying configured fallback=%s",
                    provider,
                    exc,
                    chain[index + 1],
                )
                continue
            # Surface every configured attempt. A fallback failure must not
            # hide the primary failure that caused it.
            raise ProviderUnavailable(" | ".join(errors)) from exc
    raise ProviderUnavailable("no inference provider was available")

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


def analyze_image(image_bytes: bytes, media_type: str, prompt: str, system: str | None = None) -> InferenceResult:
    # Let the active provider choose its own vision model. Passing one
    # provider's model id into a fallback provider would be a real bug.
    return _generate(prompt, system, (image_bytes, media_type))


_EXTRACTION_SYSTEM = (
    "You extract structured procedures from a teacher's description or photo. "
    'Return ONLY JSON: {"title": str, "items": [{"name": str, "aliases": [str]}], '
    '"steps": [{"instruction": str}], "ambiguities": [str]}. '
    "Never invent items the teacher did not mention or show."
)


def extract_procedure(transcript: str, skill_type: str = "packing") -> InferenceResult:
    return _generate(f"Task type: {skill_type}\nTeacher said: {transcript}", _EXTRACTION_SYSTEM)


def extract_procedure_from_image(image_bytes: bytes, media_type: str, note: str, skill_type: str = "packing") -> InferenceResult:
    prompt = (
        f"Task type: {skill_type}\n"
        "Look at the photo and list the distinct physical items that should be packed or used. "
        "Then propose the steps the teacher would take, based only on what is visible or explicitly noted.\n"
        f"Teacher note: {note or '(none)'}"
    )
    return analyze_image(image_bytes, media_type, prompt, _EXTRACTION_SYSTEM)
