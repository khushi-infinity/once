"""Prompt-1 smoke tests: health, skill lifecycle, authorization, sessions."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["app_mode"] == "mock"


def test_create_and_retrieve_skill_authorization():
    owner = "demo-teacher"
    r = client.post(
        "/api/skills",
        json={
            "owner_id": owner,
            "title": "My Event Bag",
            "type": "packing",
            "source": "text",
        },
    )
    assert r.status_code == 201, r.text
    skill = r.json()
    sid = skill["skill_id"]
    assert skill["owner_id"] == owner

    # Owner can read.
    assert client.get(f"/api/skills/{sid}", params={"reader_id": owner}).status_code == 200

    # Stranger cannot — returns 404, never leaks existence.
    assert client.get(f"/api/skills/{sid}", params={"reader_id": "stranger"}).status_code == 404

    # Unauthorized delete fails.
    assert client.delete(f"/api/skills/{sid}", params={"owner_id": "stranger"}).status_code == 404


def test_share_and_learner_access():
    owner, learner = "alice", "bob"
    sid = client.post(
        "/api/skills",
        json={"owner_id": owner, "title": "Pack tutorial", "type": "packing", "source": "voice"},
    ).json()["skill_id"]

    # bob can't see it yet
    assert client.get(f"/api/skills/{sid}", params={"reader_id": learner}).status_code == 404

    # alice grants; bob can now read but still cannot delete
    assert client.post(f"/api/skills/{sid}/share", params={"owner_id": owner, "learner_id": learner}).status_code == 200
    assert client.get(f"/api/skills/{sid}", params={"reader_id": learner}).status_code == 200
    assert client.delete(f"/api/skills/{sid}", params={"owner_id": learner}).status_code == 404

    # revoke; access lost
    client.post(f"/api/skills/{sid}/share", params={"owner_id": owner, "learner_id": learner, "revoke": "true"})
    assert client.get(f"/api/skills/{sid}", params={"reader_id": learner}).status_code == 404


def test_learner_session_progression_real_verification():
    owner, learner = "teacher-1", "student-1"
    sid = client.post(
        "/api/skills",
        json={"owner_id": owner, "title": "PhotoShare: send a photo", "type": "browser_workflow", "source": "screen_demo"},
    ).json()["skill_id"]
    client.patch(
        f"/api/skills/{sid}",
        params={"owner_id": owner},
        json={
            "steps": [
                {"order": 0, "instruction": "Open the contact Ravi", "target_element_id": "contact-ravi", "expected_event": "click"},
                {"order": 1, "instruction": "Tap Attach photo", "target_element_id": "attach-btn", "expected_event": "click"},
                {"order": 2, "instruction": "Choose the sample photo", "expected_event": "file_selected"},
                {"order": 3, "instruction": "Press Send", "expected_event": "message_sent"},
            ],
        },
    )
    client.post(f"/api/skills/{sid}/share", params={"owner_id": owner, "learner_id": learner})

    started = client.post("/api/sessions", json={"skill_id": sid, "learner_id": learner}).json()
    session_id = started["session_id"]
    assert started["step_order"] == 0
    assert started["target_element_id"] == "contact-ravi"

    # Wrong event must NOT advance.
    wrong = client.post(f"/api/sessions/{session_id}/verify", params={"learner_id": learner, "event": "click", "order": 1})
    assert wrong.json()["verdict"] == "mismatch"
    assert wrong.json()["advanced"] is False

    # Session persists across requests (resume behavior).
    nxt = client.get(f"/api/sessions/{session_id}/next", params={"learner_id": learner}).json()
    assert nxt["step_order"] == 0

    # Correct sequence advances.
    for event, order in [("click", 0), ("click", 1), ("file_selected", 2), ("message_sent", 3)]:
        v = client.post(f"/api/sessions/{session_id}/verify", params={"learner_id": learner, "event": event, "order": order})
        assert v.json()["verdict"] == "verified", (event, order, v.text)

    assert client.get(f"/api/sessions/{session_id}/next", params={"learner_id": learner}).json()["done"] is True


def test_update_bumps_version_without_destroying_original():
    owner = "demo-teacher"
    sid = client.post(
        "/api/skills",
        json={"owner_id": owner, "title": "Bag v1", "type": "packing", "source": "text"},
    ).json()["skill_id"]
    r = client.patch(
        f"/api/skills/{sid}",
        params={"owner_id": owner},
        json={"title": "Bag v2", "items": [{"name": "Charger", "aliases": ["phone charger"]}]},
    )
    assert r.json()["version"] == 2
    assert r.json()["items"][0]["name"] == "Charger"
