"""Recall tests: grounded retrieval + honest "not confirmed" semantics."""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _packing_skill(owner: str, title: str = "Conference event bag") -> dict:
    r = client.post(
        "/api/skills",
        json={
            "owner_id": owner,
            "title": title,
            "type": "packing",
            "source": "voice",
            "items": [
                {"name": "Laptop", "aliases": ["computer"]},
                {"name": "Charger", "aliases": ["phone charger"]},
                {"name": "HDMI adapter", "aliases": ["dongle"]},
                {"name": "Badge", "aliases": []},
                {"name": "Water bottle", "aliases": []},
            ],
            "steps": [{"order": 0, "instruction": "Charge everything the night before"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_recall_returns_stored_skill_and_missing_items():
    owner = _unique("recall-owner")
    skill = _packing_skill(owner)

    r = client.post(
        "/api/recall",
        json={
            "reader_id": owner,
            "query": "what am I missing for the conference event?",
            "have": ["laptop", "phone charger"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["skill"]["skill_id"] == skill["skill_id"]
    missing = {item["name"] for item in body["missing"]}
    assert missing == {"HDMI adapter", "Badge", "Water bottle"}
    # Alias confirmation works: "phone charger" confirmed "Charger".
    assert "Charger" not in missing
    assert "conference" in body["matched_terms"]


def test_recall_alias_and_no_false_absence():
    owner = _unique("recall-owner")
    _packing_skill(owner, title="Photo walk kit")

    r = client.post(
        "/api/recall",
        json={
            "reader_id": owner,
            "query": "photo walk kit, what is not confirmed?",
            "have": ["computer", "dongle"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    missing = {item["name"] for item in body["missing"]}
    assert "Laptop" not in missing
    assert "HDMI adapter" not in missing
    assert "Badge" in missing
    # The wording never claims proof of absence.
    assert "not proof of absence" in body["explanation"]


def test_recall_does_not_invent_when_nothing_matches():
    owner = _unique("recall-owner")
    _packing_skill(owner, title="Gym bag")
    r = client.post(
        "/api/recall",
        json={"reader_id": owner, "query": "quantum physics exam", "have": []},
    )
    assert r.status_code == 404
    assert "will not invent" in r.json()["detail"]


def test_recall_respects_sharing():
    owner, learner = _unique("recall-teacher"), _unique("recall-learner")
    skill = _packing_skill(owner, title="Shared event kit")

    # Before sharing, the learner cannot retrieve it.
    r = client.post(
        "/api/recall",
        json={"reader_id": learner, "query": "shared event kit", "have": []},
    )
    assert r.status_code == 404

    client.post(f"/api/skills/{skill['skill_id']}/share", params={"owner_id": owner, "learner_id": learner})
    r = client.post(
        "/api/recall",
        json={"reader_id": learner, "query": "shared event kit", "have": ["badge"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["skill"]["skill_id"] == skill["skill_id"]
