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
