"""Prompt-1 smoke tests: health, skill lifecycle, authorization, sessions."""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["app_mode"] in ("mock", "live")  # mode comes from the environment
    if body["app_mode"] == "mock":
        # Mock extraction is deterministic; never label it with a cloud model.
        assert body["inference"]["provider"] == "deterministic-mock"
        assert body["inference"]["model"] is None


def test_create_and_retrieve_skill_authorization():
    # Never use the curated demo identity in a write test: live runs hit the
    # same DynamoDB table the demo video uses.
    owner = _unique("authz-teacher")
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

    # Stranger cannot, returns 404, never leaks existence.
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
    listed = client.get("/api/skills", params={"reader_id": learner}).json()["skills"]
    assert any(s["skill_id"] == sid for s in listed), "shared skill must appear in learner's list"
    assert client.delete(f"/api/skills/{sid}", params={"owner_id": learner}).status_code == 404

    # revoke; access lost
    client.post(f"/api/skills/{sid}/share", params={"owner_id": owner, "learner_id": learner, "revoke": "true"})
    assert client.get(f"/api/skills/{sid}", params={"reader_id": learner}).status_code == 404
    listed = client.get("/api/skills", params={"reader_id": learner}).json()["skills"]
    assert all(s["skill_id"] != sid for s in listed), "revoked skill must disappear from learner's list"


def test_learner_session_progression_real_verification():
    owner, learner = "teacher-1", "student-1"
    sid = client.post(
        "/api/skills",
        json={"owner_id": owner, "title": "Guided browser workflow", "type": "browser_workflow", "source": "screen_demo"},
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

    # Right event, wrong DOM element must NOT advance either.
    wrong_element = client.post(
        f"/api/sessions/{session_id}/verify",
        params={"learner_id": learner, "event": "click", "order": 0, "element_id": "attach-btn"},
    )
    assert wrong_element.json()["verdict"] == "mismatch"
    assert wrong_element.json()["advanced"] is False

    # Session persists across requests (resume behavior).
    nxt = client.get(f"/api/sessions/{session_id}/next", params={"learner_id": learner}).json()
    assert nxt["step_order"] == 0

    # Correct sequence advances.
    checks = [
        {"event": "click", "order": 0, "element_id": "contact-ravi"},
        {"event": "click", "order": 1, "element_id": "attach-btn"},
        {"event": "file_selected", "order": 2},
        {"event": "message_sent", "order": 3},
    ]
    for params in checks:
        v = client.post(
            f"/api/sessions/{session_id}/verify",
            params={"learner_id": learner, **params},
        )
        assert v.json()["verdict"] == "verified", (params, v.text)

    assert client.get(f"/api/sessions/{session_id}/next", params={"learner_id": learner}).json()["done"] is True

    # restart=true is an explicit new run, not a silent resume.
    fresh = client.post(
        "/api/sessions",
        json={"skill_id": sid, "learner_id": learner, "restart": True},
    ).json()
    assert fresh["session_id"] != session_id
    assert fresh["step_order"] == 0


def test_update_bumps_version_without_destroying_original():
    owner = _unique("version-teacher")
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

    # The update must be *persisted* in the active mode (re-reads from the store).
    persisted = client.get(f"/api/skills/{sid}", params={"reader_id": owner}).json()
    assert persisted["version"] == 2
    assert persisted["items"][0]["name"] == "Charger"
    assert persisted["title"] == "Bag v2"


def test_six_arbitrary_items_taught_saved_and_reloaded():
    """Prompt-3 done criterion: six arbitrary items survive the save/reload path."""
    owner = "six-items-teacher"
    names = ["Passport", "USB-C charger", "Blue badge", "HDMI dongle", "Water bottle", "Noise-cancelling headphones"]
    r = client.post(
        "/api/skills",
        json={
            "owner_id": owner,
            "title": "Six arbitrary items",
            "type": "packing",
            "source": "photo",
            "items": [{"name": n} for n in names],
        },
    )
    assert r.status_code == 201, r.text
    sid = r.json()["skill_id"]
    reloaded = client.get(f"/api/skills/{sid}", params={"reader_id": owner}).json()
    assert [i["name"] for i in reloaded["items"]] == names
