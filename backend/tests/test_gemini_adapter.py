"""Gemini adapter unit tests. No network; the real smoke test is separate."""
import types

import pytest

from app.services import inference


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.headers: dict[str, str] = {}

    def json(self):
        return self._payload


def _settings():
    return types.SimpleNamespace(
        gemini_api_key="test-key",
        gemini_model_id="gemini-3.8-flash",
        gemini_fallback_model_id="gemini-3.5-flash-lite",
    )


def test_gemini_403_is_not_hidden_by_fallback(monkeypatch):
    calls: list[str] = []

    def fake_request(model, content, system):
        calls.append(model)
        return FakeResponse(403, {"error": {"message": "project denied"}}), 5

    monkeypatch.setattr(inference, "get_settings", _settings)
    monkeypatch.setattr(inference, "_gemini_request", fake_request)

    with pytest.raises(inference.ProviderUnavailable) as exc:
        inference._generate_gemini("hello", None, None)

    assert "403" in str(exc.value)
    assert "project denied" in str(exc.value)
    assert calls == ["gemini-3.8-flash"], "account denial must not retry the fallback"


def test_gemini_falls_back_only_for_model_availability(monkeypatch):
    calls: list[str] = []
    replies = [
        (FakeResponse(404, {"error": {"message": "model unavailable"}}), 4),
        (
            FakeResponse(
                200,
                {
                    "id": "request-1",
                    "steps": [
                        {
                            "type": "model_output",
                            "content": [{"type": "text", "text": '{"ok": true}'}],
                        }
                    ],
                    "usage": {"total_input_tokens": 3, "total_output_tokens": 2},
                },
            ),
            9,
        ),
    ]

    def fake_request(model, content, system):
        calls.append(model)
        return replies.pop(0)

    monkeypatch.setattr(inference, "get_settings", _settings)
    monkeypatch.setattr(inference, "_gemini_request", fake_request)

    result = inference._generate_gemini("hello", None, None)

    assert calls == ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
    assert result.model_id == "gemini-3.5-flash-lite"
    assert result.text == '{"ok": true}'
    assert result.request_id == "request-1"
    assert result.input_tokens == 3
    assert result.output_tokens == 2


def test_gemini_empty_text_is_an_error(monkeypatch):
    def fake_request(model, content, system):
        return FakeResponse(200, {"steps": [{"type": "model_output", "content": []}]}), 3

    monkeypatch.setattr(inference, "get_settings", _settings)
    monkeypatch.setattr(inference, "_gemini_request", fake_request)

    with pytest.raises(inference.ProviderUnavailable):
        inference._generate_gemini("hello", None, None)


def _chain_settings(primary: str, fallback: str = ""):
    return types.SimpleNamespace(
        inference_provider=primary,
        inference_fallback_provider=fallback,
    )


def test_explicit_fallback_runs_and_is_labeled(monkeypatch):
    calls: list[str] = []

    def fake_generate_one(provider, user_text, system, image, model):
        calls.append(provider)
        if provider == "gemini":
            raise inference.ProviderUnavailable("gemini refused the request (HTTP 403)")
        return inference.InferenceResult(
            text="fallback answer",
            provider=provider,
            model_id="google/gemini-3.8-flash",
            duration_ms=7,
        )

    monkeypatch.setattr(inference, "get_settings", lambda: _chain_settings("gemini", "openrouter"))
    monkeypatch.setattr(inference, "_generate_one", fake_generate_one)

    result = inference._generate("hello")

    assert calls == ["gemini", "openrouter"]
    assert result.provider == "openrouter"
    assert result.fallback_from == "gemini"
    assert result.text == "fallback answer"


def test_primary_success_does_not_call_fallback(monkeypatch):
    calls: list[str] = []

    def fake_generate_one(provider, user_text, system, image, model):
        calls.append(provider)
        return inference.InferenceResult(
            text="primary answer",
            provider=provider,
            model_id="gemini-3.8-flash",
            duration_ms=4,
        )

    monkeypatch.setattr(inference, "get_settings", lambda: _chain_settings("gemini", "openrouter"))
    monkeypatch.setattr(inference, "_generate_one", fake_generate_one)

    result = inference._generate("hello")

    assert calls == ["gemini"]
    assert result.fallback_from is None


def test_unknown_fallback_provider_is_rejected(monkeypatch):
    monkeypatch.setattr(inference, "get_settings", lambda: _chain_settings("gemini", "magic"))

    with pytest.raises(inference.ProviderUnavailable, match="INFERENCE_FALLBACK_PROVIDER"):
        inference._generate("hello")


def _openrouter_settings(max_tokens: int = 512):
    return types.SimpleNamespace(
        openrouter_base_url="https://openrouter.ai/api/v1",
        openrouter_api_key="test-key",
        openrouter_model="google/gemini-3.8-flash",
        openrouter_vision_model="google/gemini-3.8-flash",
        inference_max_tokens=max_tokens,
    )


def test_openrouter_uses_its_own_endpoint_key_and_token_cap(monkeypatch):
    captured: dict = {}

    def fake_post(url, headers, body):
        captured.update(url=url, headers=headers, body=body)
        return (
            FakeResponse(
                200,
                {
                    "id": "gen-1",
                    "choices": [{"message": {"content": '{"ok": true}'}}],
                    "usage": {"prompt_tokens": 4, "completion_tokens": 2},
                },
            ),
            6,
        )

    monkeypatch.setattr(inference, "get_settings", _openrouter_settings)
    monkeypatch.setattr(inference, "_post_with_retries", fake_post)

    result = inference._generate_openai_compatible(
        "hello", None, (b"\x89PNG\r\n\x1a\n", "image/png"), provider="openrouter"
    )

    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"]["authorization"] == "Bearer test-key"
    assert captured["body"]["max_tokens"] == 512
    assert captured["body"]["model"] == "google/gemini-3.8-flash"
    assert result.provider == "openrouter"
    assert result.request_id == "gen-1"


def test_primary_and_fallback_errors_are_both_surfaced(monkeypatch):
    def fake_generate_one(provider, user_text, system, image, model):
        raise inference.ProviderUnavailable(f"{provider} is down")

    monkeypatch.setattr(inference, "get_settings", lambda: _chain_settings("gemini", "openrouter"))
    monkeypatch.setattr(inference, "_generate_one", fake_generate_one)

    with pytest.raises(inference.ProviderUnavailable) as exc:
        inference._generate("hello")

    message = str(exc.value)
    assert "gemini: gemini is down" in message
    assert "openrouter: openrouter is down" in message
