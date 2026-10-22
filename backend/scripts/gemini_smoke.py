"""Real Gemini smoke test. No mocks, no fallback claims.

This script is intentionally strict: it only reports PASS when the key can
actually generate text and read an image. A project-level 403 is reported as
BLOCKED, with the provider's message, and the process exits nonzero.

Run:
    cd backend && uv run python scripts/gemini_smoke.py
"""
import base64
import os
import struct
import sys
import zlib
from pathlib import Path

import httpx

# Make `app` importable when this file is run as a script from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Force the explicit Gemini path for this smoke test. Environment variables win
# over backend/.env in pydantic-settings, so the demo's local Ollama config is
# not mutated.
os.environ["INFERENCE_PROVIDER"] = "gemini"
os.environ.setdefault("GEMINI_MODEL_ID", "gemini-3.8-flash")

from app.config import get_settings
from app.services import inference


def _png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """Create a valid solid-color PNG without Pillow or a network call."""
    row = b"\x00" + bytes(rgb) * width
    raw = row * height

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> int:
    get_settings.cache_clear()
    settings = get_settings()
    if not settings.gemini_api_key:
        print("BLOCKED: GEMINI_API_KEY is not configured in backend/.env")
        return 1

    print(f"provider={settings.inference_provider}")
    print(f"primary={settings.gemini_model_id}")
    print(f"fallback={settings.gemini_fallback_model_id}")

    with httpx.Client(timeout=60) as client:
        listed = client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": settings.gemini_api_key},
        )
        print(f"models_list={listed.status_code}")
        if listed.status_code >= 400:
            print(listed.text[:500])
            return 1
        models = [m.get("name", "") for m in listed.json().get("models", [])]
        wanted = {f"models/{settings.gemini_model_id}", f"models/{settings.gemini_fallback_model_id}"}
        print(f"requested_models_visible={sorted(wanted.intersection(models))}")

    failures = 0
    try:
        text_result = inference.extract_procedure(
            "I pack a laptop, a charger and a water bottle for a conference.",
            "packing",
        )
        parsed = inference.parse_json_object(text_result.text)
        print(
            "text=PASS "
            f"model={text_result.model_id} request_id={text_result.request_id} "
            f"items={len(parsed.get('items', []))}"
        )
    except Exception as exc:  # noqa: BLE001 - report the provider's real error
        print(f"text=FAIL {type(exc).__name__}: {exc}")
        failures += 1

    try:
        image_result = inference.extract_procedure_from_image(
            _png(64, 64, (255, 255, 255)),
            "image/png",
            "A blank white square. Return an empty list if there is nothing to pack.",
            "packing",
        )
        parsed = inference.parse_json_object(image_result.text)
        print(
            "image=PASS "
            f"model={image_result.model_id} request_id={image_result.request_id} "
            f"items={len(parsed.get('items', []))}"
        )
    except Exception as exc:  # noqa: BLE001 - report the provider's real error
        print(f"image=FAIL {type(exc).__name__}: {exc}")
        failures += 1

    encoded = base64.b64encode(_png(8, 8, (10, 20, 30))).decode("ascii")
    print(f"image_payload_bytes={len(encoded)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
