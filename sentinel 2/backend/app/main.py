"""Sentinel API — full backend.

    uvicorn backend.app.main:app --reload
    open http://localhost:8000

  Extra endpoints (hackathon)
   GET  /api/stats            aggregate stats for live dashboard counters
   POST /api/demo/burst       fire N incidents rapidly for dramatic demo

Endpoints
  GET  /                    dashboard
  GET  /health              model + system status
  POST /analyze/frame       image upload -> full pipeline result
  POST /analyze/video       video upload -> sampled-frame pipeline results
  POST /api/demo            synthetic incident through the REAL pipeline
  GET  /api/incidents       recent incidents
  GET  /api/units           unit registry snapshot
  GET  /api/zones           zone graph for the map
  POST /api/ask             RAG chat over incident history
  WS   /ws/stream           frame stream in -> pipeline results out
"""
from __future__ import annotations

import base64
import tempfile
import asyncio
from pathlib import Path

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from .dispatch import EDGES, REGISTRY, ZONES
from .pipeline import MODELS, analyze

app = FastAPI(title="Sentinel API", version="1.0.0")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskBody(BaseModel):
    question: str


class DemoBody(BaseModel):
    zone: str | None = None


# WebSocket Connection Manager for Broadcasting
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                if connection in self.active_connections:
                    self.active_connections.remove(connection)


manager = ConnectionManager()


@app.get("/")
def dashboard():
    return RedirectResponse(url="http://localhost:3000")


@app.get("/health")
def health():
    import os
    return {"status": "ok", "models": MODELS.status,
            "llm": "anthropic" if os.environ.get("ANTHROPIC_API_KEY") else "heuristic"}


@app.post("/analyze/frame")
async def analyze_frame(file: UploadFile, zone: str | None = None):
    res = analyze(await file.read(), zone=zone)
    await manager.broadcast({"type": "incident", "payload": res})
    return res


@app.post("/analyze/video")
async def analyze_video(file: UploadFile, every_n: int = 30, max_frames: int = 10):
    """Sample every Nth frame through the pipeline. Needs opencv."""
    import cv2
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "v.mp4").suffix,
                                     delete=False) as f:
        f.write(data)
        path = f.name
    cap = cv2.VideoCapture(path)
    results, i = [], 0
    while cap.isOpened() and len(results) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if i % every_n == 0:
            ok2, buf = cv2.imencode(".jpg", frame)
            if ok2:
                res = analyze(buf.tobytes()) | {"frame_index": i}
                results.append(res)
                await manager.broadcast({"type": "incident", "payload": res})
        i += 1
    cap.release()
    Path(path).unlink(missing_ok=True)
    return {"frames_analyzed": len(results), "results": results}


@app.post("/api/demo")
async def demo_incident(body: DemoBody):
    res = analyze(None, zone=body.zone, demo=True)
    await manager.broadcast({"type": "incident", "payload": res})
    return res


@app.get("/api/incidents")
def incidents(limit: int = 30):
    from agents.graph import STORE
    return STORE.recent(limit=limit)


@app.get("/api/units")
def units():
    return REGISTRY.snapshot()


@app.post("/api/units/{unit_id}/release")
async def release_unit(unit_id: str):
    REGISTRY.release(unit_id)
    payload = {
        "id": unit_id,
        "busy": False,
        "zone": REGISTRY.units[unit_id]["zone"]
    }
    await manager.broadcast({"type": "unit_update", "payload": payload})
    return {"released": unit_id}


@app.get("/api/zones")
def zones():
    return {"zones": {z: {"x": x, "y": y} for z, (x, y) in ZONES.items()},
            "edges": EDGES}


@app.get("/api/stats")
def stats():
    from agents.graph import STORE
    s = STORE.stats()
    s["active_units"] = REGISTRY.active_count()
    s["total_units"] = REGISTRY.total_count()
    return s


@app.get("/api/state")
def get_state():
    from agents.graph import STORE
    return {
        "incidents": STORE.recent(limit=30),
        "units": REGISTRY.snapshot(),
        "zones": {"zones": {z: {"x": x, "y": y} for z, (x, y) in ZONES.items()}, "edges": EDGES},
        "stats": stats(),
        "health": health()
    }


@app.post("/api/demo/burst")
async def demo_burst(n: int = 4):
    """Fire multiple incidents rapidly for dramatic hackathon demo."""
    results = []
    for _ in range(min(n, 6)):
        res = analyze(None, demo=True)
        results.append(res)
        await manager.broadcast({"type": "incident", "payload": res})
        await asyncio.sleep(0.3)
    return {"count": len(results), "incidents": results}


@app.post("/api/ask")
def ask(body: AskBody):
    from agents.graph import answer_query
    return answer_query(body.question)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Maintain connection, handle messages if sent
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    """Fallback WebSocket endpoint (legacy/stream)."""
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("demo"):
                res = analyze(None, demo=True)
                await ws.send_json(res)
            else:
                res = analyze(base64.b64decode(msg["frame"]))
                await ws.send_json(res)
    except WebSocketDisconnect:
        pass

