"""Dispatch — A* pathfinding over the city zone graph + emergency unit registry.

The zone graph is a small demo city (12 zones). Replace ZONES/EDGES with real
map data later; the A* itself is production-shaped (haversine heuristic hook,
priority-queue frontier).
"""
from __future__ import annotations

import heapq
import math
import threading

# zone_id -> (x, y) demo coordinates (km-ish grid)
ZONES: dict[str, tuple[float, float]] = {
    "Z-01": (0, 0), "Z-02": (2, 0.5), "Z-03": (4, 0), "Z-04": (6, 1),
    "Z-05": (1, 2), "Z-06": (3, 2.5), "Z-07": (5, 2), "Z-08": (7, 3),
    "Z-09": (0.5, 4), "Z-10": (2.5, 4.5), "Z-11": (4.5, 4), "Z-12": (6.5, 5),
}
EDGES: list[tuple[str, str]] = [
    ("Z-01", "Z-02"), ("Z-02", "Z-03"), ("Z-03", "Z-04"),
    ("Z-05", "Z-06"), ("Z-06", "Z-07"), ("Z-07", "Z-08"),
    ("Z-09", "Z-10"), ("Z-10", "Z-11"), ("Z-11", "Z-12"),
    ("Z-01", "Z-05"), ("Z-05", "Z-09"), ("Z-02", "Z-06"),
    ("Z-06", "Z-10"), ("Z-03", "Z-07"), ("Z-07", "Z-11"),
    ("Z-04", "Z-08"), ("Z-08", "Z-12"),
]
AVG_SPEED_KMPH = 30.0


def _dist(a: str, b: str) -> float:
    (x1, y1), (x2, y2) = ZONES[a], ZONES[b]
    return math.hypot(x2 - x1, y2 - y1)


_ADJ: dict[str, list[tuple[str, float]]] = {z: [] for z in ZONES}
for u, v in EDGES:
    w = _dist(u, v)
    _ADJ[u].append((v, w))
    _ADJ[v].append((u, w))


def astar(start: str, goal: str) -> tuple[list[str], float]:
    """Returns (path, distance_km). Heuristic = straight-line distance (admissible)."""
    frontier: list[tuple[float, str]] = [(0.0, start)]
    came: dict[str, str | None] = {start: None}
    g: dict[str, float] = {start: 0.0}
    while frontier:
        _, cur = heapq.heappop(frontier)
        if cur == goal:
            path = []
            n: str | None = cur
            while n is not None:
                path.append(n)
                n = came[n]
            return path[::-1], g[goal]
        for nxt, w in _ADJ[cur]:
            ng = g[cur] + w
            if ng < g.get(nxt, math.inf):
                g[nxt] = ng
                came[nxt] = cur
                heapq.heappush(frontier, (ng + _dist(nxt, goal), nxt))
    return [], math.inf


class UnitRegistry:
    """Thread-safe registry of emergency units. Dispatcher agent's tool backend."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.units: dict[str, dict] = {
            "AMB-01": {"zone": "Z-02", "busy": False, "type": "ambulance"},
            "AMB-02": {"zone": "Z-10", "busy": False, "type": "ambulance"},
            "PAT-01": {"zone": "Z-07", "busy": False, "type": "patrol"},
            "PAT-02": {"zone": "Z-04", "busy": False, "type": "patrol"},
        }

    def find_nearest(self, zone: str, unit_type: str | None = None) -> dict | None:
        with self._lock:
            best = None
            for uid, u in self.units.items():
                if u["busy"] or (unit_type and u["type"] != unit_type):
                    continue
                path, dist = astar(u["zone"], zone)
                if not path:
                    continue
                eta = dist / AVG_SPEED_KMPH * 60
                if best is None or eta < best["eta_min"]:
                    best = {"unit_id": uid, "type": u["type"], "path": path,
                            "distance_km": round(dist, 2), "eta_min": round(eta, 1)}
            return best

    def dispatch(self, unit_id: str, zone: str) -> bool:
        with self._lock:
            u = self.units.get(unit_id)
            if not u or u["busy"]:
                return False
            u["busy"] = True
            u["zone"] = zone
            return True

    def release(self, unit_id: str) -> None:
        with self._lock:
            if unit_id in self.units:
                self.units[unit_id]["busy"] = False

    def snapshot(self) -> dict:
        with self._lock:
            return {k: dict(v) for k, v in self.units.items()}

    def active_count(self) -> int:
        with self._lock:
            return sum(1 for u in self.units.values() if u["busy"])

    def total_count(self) -> int:
        with self._lock:
            return len(self.units)


REGISTRY = UnitRegistry()
