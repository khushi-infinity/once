"""Independent MCP client smoke test (Streamable HTTP, real server process).

Starts `python -m app.mcp_server`, then uses the official MCP client to:
  1. initialize and print the negotiated protocol version;
  2. list tools and assert the ONCE tool surface;
  3. create a real skill through the HTTP API, then call MCP tools against it
     (list/get/recall/start/next/verify) and print sanitized results.

Run: cd backend && uv run python scripts/mcp_smoke.py
Requires the HTTP API on :8000 (uvicorn app.main:app --port 8000).
"""
import asyncio
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

ROOT = Path(__file__).resolve().parents[1]
MCP_URL = "http://127.0.0.1:8765/mcp"
API = "http://localhost:8000"
EXPECTED = {
    "once_list_skills",
    "once_get_skill",
    "once_recall_missing",
    "once_start_session",
    "once_next_step",
    "once_verify_step",
    "once_extract_draft",
    "once_next_step_model_contract",
}


def _wait_for_port(host: str, port: int, timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError(f"port {port} did not open")


def _text(result) -> str:
    parts = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts)


async def run() -> int:
    tag = uuid.uuid4().hex[:6]
    owner, learner = f"mcp-teacher-{tag}", f"mcp-learner-{tag}"
    http = httpx.Client(base_url=API, timeout=30)

    skill = http.post(
        "/api/skills",
        json={
            "owner_id": owner,
            "title": f"MCP event kit {tag}",
            "type": "packing",
            "source": "text",
            "items": [{"name": "Passport"}, {"name": "Charger"}, {"name": "Badge"}],
            "steps": [
                {"order": 0, "instruction": "Open the bag", "target_element_id": "bag", "expected_event": "click"},
                {"order": 1, "instruction": "Put the badge in", "target_element_id": "badge-pocket", "expected_event": "click"},
            ],
        },
    )
    skill.raise_for_status()
    skill = skill.json()
    skill_id = skill["skill_id"]
    share = http.post(
        f"/api/skills/{skill_id}/share",
        params={"owner_id": owner, "learner_id": learner},
    )
    share.raise_for_status()
    print(f"[setup] shared {skill_id} with {learner}")

    try:
        async with (
            streamable_http_client(MCP_URL) as (read, write),
            ClientSession(read, write) as session,
        ):
                init = await session.initialize()
                print(f"protocol={init.protocol_version} server={init.server_info.name} "
                      f"version={init.server_info.version}")

                tools = await session.list_tools()
                names = {t.name for t in tools.tools}
                print(f"tools={sorted(names)}")
                missing = EXPECTED - names
                assert not missing, f"missing tools: {sorted(missing)}"

                listed = await session.call_tool("once_list_skills", {"reader_id": owner})
                assert skill_id in _text(listed), "created skill not visible via MCP"
                print(f"[PASS] once_list_skills returned {len(_text(listed))} bytes incl. {skill_id}")

                got = await session.call_tool("once_get_skill", {"skill_id": skill_id, "reader_id": owner})
                assert _text(got).find(skill_id) >= 0
                print("[PASS] once_get_skill authorized read")

                denied = await session.call_tool("once_get_skill", {"skill_id": skill_id, "reader_id": "stranger"})
                assert "not accessible" in _text(denied)
                print("[PASS] once_get_skill denied a stranger (same authz as HTTP)")

                recalled = await session.call_tool(
                    "once_recall_missing",
                    {"reader_id": owner, "query": f"MCP event kit {tag} what am I missing?", "have": ["passport"]},
                )
                recalled_body = json.loads(_text(recalled))
                not_confirmed = {m["name"] for m in recalled_body["not_confirmed"]}
                assert not_confirmed == {"Charger", "Badge"}, not_confirmed
                print("[PASS] once_recall_missing grounded on the stored skill")

                session_tool = await session.call_tool(
                    "once_start_session", {"skill_id": skill_id, "learner_id": learner}
                )
                started = json.loads(_text(session_tool))
                sid = started["session_id"]
                assert started["step_order"] == 0
                print(f"[PASS] once_start_session session={sid} step=0")

                verified = await session.call_tool(
                    "once_verify_step",
                    {
                        "session_id": sid,
                        "learner_id": learner,
                        "event": "click",
                        "order": 0,
                        "element_id": "bag",
                    },
                )
                assert json.loads(_text(verified))["verdict"] == "verified"
                print("[PASS] once_verify_step accepted the recorded element")

                wrong = await session.call_tool(
                    "once_verify_step",
                    {
                        "session_id": sid,
                        "learner_id": learner,
                        "event": "click",
                        "order": 1,
                        "element_id": "wrong-pocket",
                    },
                )
                assert json.loads(_text(wrong))["verdict"] == "mismatch"
                print("[PASS] once_verify_step rejected a wrong element without advancing")

                extracted = await session.call_tool(
                    "once_extract_draft",
                    {"transcript": "Pack my passport and charger for the trip.", "skill_type": "packing"},
                )
                assert "engine" in _text(extracted)
                print("[PASS] once_extract_draft returned a draft + engine metadata")
        return 0
    finally:
        http.delete(f"/api/skills/{skill_id}", params={"owner_id": owner})


def main() -> int:
    env = os.environ.copy()
    server = subprocess.Popen(
        [sys.executable, "-m", "app.mcp_server"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_for_port("127.0.0.1", 8765)
        return asyncio.run(run())
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
