"""Agent Skill export tests: portable markdown, zip bundle, authorization."""
import io
import uuid
import zipfile

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_agent_skill_markdown_and_bundle():
    owner = _unique("agent-teacher")
    created = client.post(
        "/api/skills",
        json={
            "owner_id": owner,
            "title": "My Event Bag",
            "type": "packing",
            "source": "text",
            "summary": "Everything I need for a conference.",
            "items": [
                {"name": "Laptop"},
                {"name": "Charger", "aliases": ["phone charger"]},
            ],
            "steps": [
                {"order": 0, "instruction": "Charge everything the night before."},
            ],
        },
    )
    assert created.status_code == 201, created.text
    skill = created.json()
    skill_id = skill["skill_id"]

    try:
        md = client.get(
            f"/api/skills/{skill_id}/agent-skill",
            params={"reader_id": owner},
        )
        assert md.status_code == 200
        assert md.headers["content-type"].startswith("text/markdown")
        body = md.text
        assert body.startswith("---\n")
        assert "name: my-event-bag" in body
        assert "description:" in body
        assert "# My Event Bag" in body
        assert "- Laptop" in body
        assert "phone charger" in body
        assert "not confirmed" in body
        assert "Charge everything the night before." in body

        bundle = client.get(
            f"/api/skills/{skill_id}/agent-skill",
            params={"reader_id": owner, "format": "zip"},
        )
        assert bundle.status_code == 200
        assert bundle.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
            names = set(archive.namelist())
            assert "my-event-bag/SKILL.md" in names
            assert "my-event-bag/once-skill.json" in names
            manifest_text = archive.read("my-event-bag/once-skill.json").decode()
            assert skill_id in manifest_text
            assert "Laptop" in manifest_text

        denied = client.get(
            f"/api/skills/{skill_id}/agent-skill",
            params={"reader_id": "stranger"},
        )
        assert denied.status_code == 404
    finally:
        client.delete(f"/api/skills/{skill_id}", params={"owner_id": owner})
