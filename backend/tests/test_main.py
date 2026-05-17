from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_prefix_is_registered():
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert any(path.startswith("/api/users") for path in paths)
    assert any(path.startswith("/api/conferences") for path in paths)
