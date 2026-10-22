"""Window guide endpoint behavior that can be checked without a vision model."""
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


@pytest.mark.skipif(get_settings().is_live, reason="mock-mode assertion; live calls the real model")
def test_window_guide_is_explicitly_unavailable_in_mock_mode():
    response = client.post(
        "/api/window/guide",
        files={"file": ("window.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        data={"question": "Where is the Export button?", "app_name": "Preview"},
    )
    assert response.status_code == 503
    assert "live AI provider" in response.json()["detail"]
