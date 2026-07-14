"""Sentinel test suite — run with:  pytest tests/ -v"""
import numpy as np
import pytest


# ------------------------------------------------------------------ features
def test_feature_vector_shape_and_ranges():
    from backend.app.features import extract_features
    det = {"boxes": [{"cls": "car", "conf": 0.9}, {"cls": "motorcycle", "conf": 0.8}],
           "collision_conf": 0.7, "pothole_conf": 0.1}
    f = extract_features(det)
    assert f.shape == (15,)
    assert f.dtype == np.float32
    assert 0 <= f[1] <= 1          # collision_conf passthrough
    assert f[0] == 2               # vehicle_count
    assert -1 <= f[7] <= 1         # hour_sin bounded


def test_features_empty_scene():
    from backend.app.features import extract_features
    f = extract_features({"boxes": []})
    assert f[0] == 0 and f[3] == 0 and f[6] == 0


# ------------------------------------------------------------------ dispatch
def test_astar_finds_path_and_is_symmetric():
    from backend.app.dispatch import astar
    p1, d1 = astar("Z-01", "Z-12")
    p2, d2 = astar("Z-12", "Z-01")
    assert p1[0] == "Z-01" and p1[-1] == "Z-12"
    assert abs(d1 - d2) < 1e-9


def test_astar_trivial():
    from backend.app.dispatch import astar
    p, d = astar("Z-05", "Z-05")
    assert p == ["Z-05"] and d == 0.0


def test_registry_dispatch_and_release():
    from backend.app.dispatch import UnitRegistry
    reg = UnitRegistry()
    u = reg.find_nearest("Z-06")
    assert u is not None and u["eta_min"] > 0
    assert reg.dispatch(u["unit_id"], "Z-06")
    assert not reg.dispatch(u["unit_id"], "Z-06")   # already busy
    reg.release(u["unit_id"])
    assert not reg.units[u["unit_id"]]["busy"]


# --------------------------------------------------------------------- store
def test_store_roundtrip_and_search(tmp_path):
    from backend.app.store import IncidentStore
    s = IncidentStore(str(tmp_path / "t.db"))
    iid = s.add({"zone": "Z-03", "verdict": "CONFIRMED", "severity": 80.0,
                 "priority": "HIGH", "response_needed": True,
                 "narrative": "truck and motorcycle collision at night"})
    assert s.recent()[0]["id"] == iid
    hits = s.search("motorcycle collision")
    assert hits and hits[0]["id"] == iid
    stats = s.zone_stats("Z-03")
    assert stats["count"] == 1


# ----------------------------------------------------------------------- ANN
def test_severity_net_forward_and_weights_load():
    import sys, torch
    sys.path.insert(0, "models/ann")
    from severity_net import SeverityNet
    ckpt = torch.load("models/ann/weights_severity_net.pt",
                      map_location="cpu", weights_only=False)
    m = SeverityNet()
    m.load_state_dict(ckpt["state_dict"])
    m.eval()
    out = m(torch.randn(3, 15))
    assert out["severity"].shape == (3,)
    assert bool(((out["severity"] >= 0) & (out["severity"] <= 100)).all())
    assert out["priority_logits"].shape == (3, 3)


# --------------------------------------------------------------------- agents
def test_agent_graph_confirmed_path(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from agents.graph import GRAPH
    r = GRAPH.invoke({
        "incident_id": "INC-T1", "zone": "Z-06",
        "detections": {"collision_conf": 0.9,
                       "boxes": [{"cls": "truck", "conf": 0.9}]},
        "severity": 75.0, "response_needed": True, "priority": "HIGH",
    })
    assert r["report"]["verdict"] == "CONFIRMED"
    assert r["report"]["dispatched_unit"] is not None
    assert any(t["agent"] == "dispatcher" for t in r["trace"])


def test_agent_graph_false_positive_skips_dispatch(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from agents.graph import GRAPH
    r = GRAPH.invoke({
        "incident_id": "INC-T2", "zone": "Z-02",
        "detections": {"collision_conf": 0.05, "boxes": []},
        "severity": 10.0, "response_needed": False, "priority": "LOW",
    })
    assert r["report"]["verdict"] == "FALSE_POSITIVE"
    assert r["report"]["dispatched_unit"] is None


# ------------------------------------------------------------------ API layer
@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from backend.app.main import app
    return TestClient(app)


def test_health(client):
    r = client.get("/health").json()
    assert r["status"] == "ok" and "severity_net" in r["models"]


def test_demo_endpoint_full_loop(client):
    r = client.post("/api/demo", json={"zone": "Z-07"}).json()
    assert r["zone"] == "Z-07"
    assert "severity" in r["ann"] and r["report"] is not None
    assert isinstance(r["trace"], list) and len(r["trace"]) >= 3


def test_ask_endpoint(client):
    client.post("/api/demo", json={})
    r = client.post("/api/ask", json={"question": "recent incidents"}).json()
    assert "answer" in r
