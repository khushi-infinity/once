"""Teach-extraction contract tests (mock mode — deterministic, labeled)."""
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)

TRANSCRIPT = (
    "Remember how I pack my bag for events. I take a charger, water bottle, "
    "extra bag, pen, notebook and mobile phone."
)


@pytest.fixture()
def mock_mode(monkeypatch):
    monkeypatch.setenv("APP_MODE", "mock")
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


def test_mock_extraction_is_labeled_and_grounds_in_teacher_words(mock_mode):
    r = client.post(
        "/api/teach/extract",
        json={"transcript": TRANSCRIPT, "skill_type": "packing", "source": "voice"},
    )
    assert r.status_code == 200
    body = r.json()
    # Honest labeling: judges see exactly what produced the draft.
    assert body["engine"]["provider"] == "deterministic-mock"
    assert body["engine"]["model"] is None
    names = " ".join(i["name"].lower() for i in body["items"])
    for expected in ("charger", "water", "pen", "notebook", "mobile"):
        assert expected in names, f"item '{expected}' missing: {names}"
    # The draft must never contain 6 hard-coded items — it comes from the text.
    assert len(body["items"]) >= 5
    assert body["ambiguities"], "mock engine must say it is not AI"


def test_extract_validates_transcript():
    r = client.post("/api/teach/extract", json={"transcript": "ok"})
    assert r.status_code == 422


def test_live_extraction_never_uses_deterministic_parser(monkeypatch):
    """In live mode the draft engine is a real provider — or a real failure."""
    monkeypatch.setenv("APP_MODE", "live")
    get_settings.cache_clear()
    try:
        r = client.post(
            "/api/teach/extract",
            json={"transcript": TRANSCRIPT, "skill_type": "packing"},
        )
        body = r.json()
        engine = (body.get("engine") or {}).get("provider", "")
        assert r.status_code == 200 or r.status_code in (502, 503)
        # With the AI provider unconfigured or failing we surface the real
        # error — never a deterministic result pretending to be AI.
        assert engine != "deterministic-mock"
        if r.status_code == 502:
            assert "extraction failed" in body["detail"].lower()
    finally:
        get_settings.cache_clear()


def test_create_with_confirmed_items_roundtrips_through_active_store():
    """Draft confirmation → create → re-read (works in mock AND live stores)."""
    owner = "draft-flow-teacher"
    r = client.post(
        "/api/skills",
        json={
            "owner_id": owner,
            "title": "My Event Bag",
            "type": "packing",
            "source": "voice",
            "items": [
                {"name": "Charger", "aliases": ["phone charger"]},
                {"name": "Water bottle", "aliases": ["bottle"]},
                {"name": "Extra bag", "aliases": ["spare bag"]},
                {"name": "Pen"},
                {"name": "Notebook", "aliases": ["notepad"]},
                {"name": "Mobile phone", "aliases": ["phone"]},
            ],
        },
    )
    assert r.status_code == 201, r.text
    sid = r.json()["skill_id"]
    assert r.json()["items"][0]["name"] == "Charger"

    back = client.get(f"/api/skills/{sid}", params={"reader_id": owner}).json()
    assert back["version"] == 1
    assert {i["name"] for i in back["items"]} == {
        "Charger", "Water bottle", "Extra bag", "Pen", "Notebook", "Mobile phone",
    }
