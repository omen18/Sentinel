"""Pipeline — the perceive -> predict -> decide -> explain loop in one call."""
from __future__ import annotations

import random
import uuid

from .dispatch import ZONES
from .inference import ModelManager

MODELS = ModelManager()


def analyze(image_bytes: bytes | None = None, *, zone: str | None = None,
            demo: bool = False, store=None, graph=None) -> dict:
    from agents.graph import GRAPH, STORE  # late import avoids circulars
    store = store or STORE
    graph = graph or GRAPH

    zone = zone or random.choice(list(ZONES))
    incident_id = f"INC-{uuid.uuid4().hex[:6].upper()}"

    # 1. Perceive (CNN)
    detections = MODELS.detect(image_bytes, demo=demo)
    if image_bytes is not None and MODELS.accident_cnn is not None:
        detections["collision_conf"] = max(
            detections["collision_conf"], MODELS.classify_frame(image_bytes)
        )

    # 2. Predict (ANN) — demo mode randomizes weather context for variety
    rain = demo and random.random() < 0.5
    ann = MODELS.assess(detections, store.zone_stats(zone), rain=rain)

    # 3-4. Decide + Explain (agents)
    result = graph.invoke({
        "incident_id": incident_id, "zone": zone, "detections": detections,
        "severity": ann["severity"], "response_needed": ann["response_needed"],
        "priority": ann["priority"],
    })

    return {
        "incident_id": incident_id, "zone": zone,
        "detections": detections, "ann": ann,
        "report": result.get("report"), "trace": result.get("trace", []),
        "dispatch_path": result.get("dispatch_path"),
        "models": MODELS.status,
    }
