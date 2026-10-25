import os
import sys
import tempfile
from pathlib import Path

import pytest

# Изолированная папка данных и чистое окружение до импорта приложения
os.environ["MINDNET_DATA_DIR"] = tempfile.mkdtemp(prefix="mindnet-test-")
for var in ("GEMINI_API_KEY", "OPENAI_API_KEY", "HF_API_KEY", "DEEPSEEK_API_KEY", "GROK_API_KEY", "AI_MODELS"):
    os.environ[var] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        c.delete("/nodes/all/")
        yield c


def node(client, title, **kw):
    body = {"title": title, "description": "", "node_type": "skill", "level": 1, **kw}
    r = client.post("/nodes/", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_health_reports_db(client):
    data = client.get("/health").json()
    assert data["status"] == "ok"
    assert data["db"] is True
    assert data["ai_configured"] is False


def test_create_node_upserts_by_title(client):
    a = node(client, "Python", level=1)
    b = node(client, "  Python ", level=4)
    assert a["id"] == b["id"]
    assert b["level"] == 4
    assert len(client.get("/nodes/").json()) == 1


def test_edges_and_graph(client):
    a = node(client, "Python")
    b = node(client, "FastAPI")
    edge = {"from_node": a["id"], "to_node": b["id"], "relation_type": "requires"}
    e1 = client.post("/edges/", json=edge).json()
    e2 = client.post("/edges/", json=edge).json()
    assert e1["id"] == e2["id"]  # без дублей

    graph = client.get("/graph/").json()
    assert len(graph["nodes"]) == 2
    assert graph["edges"] == [{
        "id": e1["id"], "from": a["id"], "to": b["id"], "relation_type": "requires",
        "from_title": "Python", "to_title": "FastAPI",
    }]


def test_edge_to_missing_node_fails(client):
    a = node(client, "Python")
    r = client.post("/edges/", json={"from_node": a["id"], "to_node": "nope", "relation_type": "related_to"})
    assert r.status_code == 500


def test_update_and_delete_node_cascades(client):
    a = node(client, "Python")
    b = node(client, "Django")
    client.post("/edges/", json={"from_node": a["id"], "to_node": b["id"], "relation_type": "related_to"})

    r = client.put(f"/nodes/{a['id']}", json={"level": 5, "node_type": "tool"})
    assert r.json()["level"] == 5 and r.json()["node_type"] == "tool"
    assert client.put(f"/nodes/{a['id']}", json={"title": "Django"}).status_code == 409
    assert client.put("/nodes/missing", json={"level": 2}).status_code == 404

    assert client.delete(f"/nodes/{a['id']}").status_code == 200
    assert client.delete(f"/nodes/{a['id']}").status_code == 404
    assert client.get("/graph/").json()["edges"] == []


def test_settings_masks_keys_and_reloads_ai(client):
    view = client.put("/settings", json={"OPENAI_API_KEY": "sk-test-1234567890abcd"}).json()
    assert view["OPENAI_API_KEY"] == {"set": True, "hint": "…abcd"}
    assert view["ai_configured"] is True
    assert view["ai_models"] == ["openai"]
    assert "1234567890" not in client.get("/settings").text

    # None — оставить как есть, "" — удалить
    client.put("/settings", json={"OPENAI_API_KEY": None, "PROXY_URL": ""})
    assert client.get("/settings").json()["OPENAI_API_KEY"]["set"] is True
    view = client.put("/settings", json={"OPENAI_API_KEY": ""}).json()
    assert view["OPENAI_API_KEY"]["set"] is False
    assert view["ai_configured"] is False
