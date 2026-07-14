"""Feature extraction — maps CNN detections + context to SeverityNet's 15 inputs.

This is the contract between the vision layer and the ANN. Keep FEATURES in
models/ann/severity_net.py as the single source of truth for ordering.
"""
from __future__ import annotations

import math
from datetime import datetime

import numpy as np

TWO_WHEELERS = {"motorcycle", "bicycle", "rider"}
HEAVY = {"truck", "bus"}
ROAD_TYPE_MAP = {"residential": 0, "arterial": 1, "highway": 2}


def extract_features(
    detections: dict,
    *,
    zone_stats: dict | None = None,
    when: datetime | None = None,
    rain: bool = False,
    road_type: str = "arterial",
) -> np.ndarray:
    """detections: {"boxes":[{"cls":str,"conf":float},...], "collision_conf":float,
                    "pothole_conf":float}"""
    when = when or datetime.now()
    zone_stats = zone_stats or {"incident_rate": 0.15, "traffic_density": 0.5}
    boxes = detections.get("boxes", [])

    classes = [b["cls"] for b in boxes]
    confs = [b["conf"] for b in boxes]
    n = len(boxes)

    vehicle_count = sum(c not in {"person"} for c in classes)
    person_count = sum(c == "person" for c in classes)
    two_wheeler_ratio = (sum(c in TWO_WHEELERS for c in classes) / n) if n else 0.0
    heavy_flag = float(any(c in HEAVY for c in classes))
    avg_conf = float(np.mean(confs)) if confs else 0.0

    hour = when.hour + when.minute / 60.0
    feats = np.array(
        [
            vehicle_count,
            float(detections.get("collision_conf", 0.0)),
            float(detections.get("pothole_conf", 0.0)),
            person_count,
            two_wheeler_ratio,
            heavy_flag,
            avg_conf,
            math.sin(2 * math.pi * hour / 24),
            math.cos(2 * math.pi * hour / 24),
            float(when.weekday() >= 5),
            float(hour < 6 or hour > 20),
            float(rain),
            float(ROAD_TYPE_MAP.get(road_type, 1)),
            float(zone_stats["incident_rate"]),
            float(zone_stats["traffic_density"]),
        ],
        dtype=np.float32,
    )
    return feats
