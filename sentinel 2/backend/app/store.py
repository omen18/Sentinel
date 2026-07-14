"""Incident store + retriever — SQLite persistence and TF-IDF similarity RAG.

TF-IDF keeps the starter dependency-light and fully local. The retriever
interface (add / search) is deliberately pgvector-shaped: swap the internals
for embeddings + pgvector in Phase 2 without touching the agents.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    ts REAL,
    zone TEXT,
    verdict TEXT,
    severity REAL,
    priority TEXT,
    response_needed INTEGER,
    dispatched_unit TEXT,
    detections TEXT,
    narrative TEXT
);
"""


class IncidentStore:
    def __init__(self, path: str = "data/sentinel.db") -> None:
        self._lock = threading.Lock()
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.execute(SCHEMA)
        self.conn.commit()

    def add(self, rec: dict) -> str:
        rec = dict(rec)
        rec.setdefault("id", f"INC-{uuid.uuid4().hex[:6].upper()}")
        rec.setdefault("ts", time.time())
        with self._lock:
            self.conn.execute(
                "INSERT OR REPLACE INTO incidents VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    rec["id"], rec["ts"], rec.get("zone"), rec.get("verdict"),
                    rec.get("severity"), rec.get("priority"),
                    int(bool(rec.get("response_needed"))),
                    rec.get("dispatched_unit"),
                    json.dumps(rec.get("detections", {})),
                    rec.get("narrative", ""),
                ),
            )
            self.conn.commit()
        return rec["id"]

    def _rows(self, where: str = "", params: tuple = (),
              limit: int | None = None) -> list[dict]:
        q = f"SELECT * FROM incidents {where} ORDER BY ts DESC"
        if limit is not None:
            q += f" LIMIT {int(limit)}"
        cur = self.conn.execute(q, params)
        cols = [c[0] for c in cur.description]
        out = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            d["detections"] = json.loads(d["detections"] or "{}")
            out.append(d)
        return out

    def recent(self, limit: int = 50) -> list[dict]:
        return self._rows(limit=limit)

    def by_zone(self, zone: str, limit: int = 10) -> list[dict]:
        return self._rows("WHERE zone = ?", (zone,), limit=limit)

    def zone_stats(self, zone: str) -> dict:
        cur = self.conn.execute(
            "SELECT COUNT(*), AVG(severity) FROM incidents WHERE zone = ?", (zone,)
        )
        count, avg_sev = cur.fetchone()
        total = self.conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0] or 1
        return {
            "incident_rate": min(1.0, count / max(total, 1) * 3),
            "traffic_density": 0.5,
            "count": count,
            "avg_severity": round(avg_sev or 0.0, 1),
        }

    # ---------------------------------------------------------- stats
    def stats(self) -> dict:
        """Aggregate stats for the dashboard header."""
        cur = self.conn.execute(
            "SELECT COUNT(*), AVG(severity), "
            "SUM(CASE WHEN verdict='CONFIRMED' THEN 1 ELSE 0 END) "
            "FROM incidents"
        )
        total, avg_sev, confirmed = cur.fetchone()
        return {
            "total_incidents": total or 0,
            "confirmed": confirmed or 0,
            "avg_severity": round(avg_sev or 0.0, 1),
            "confirmed_rate": round((confirmed or 0) / max(total or 1, 1) * 100, 1),
        }

    # ------------------------------------------------------------ RAG search
    def search(self, query: str, k: int = 5) -> list[dict]:
        """TF-IDF cosine similarity over narrative + metadata text."""
        rows = self.recent(limit=500)
        if not rows:
            return []
        docs = [
            f"{r['zone']} {r['verdict']} severity {r['severity']} "
            f"priority {r['priority']} {r['narrative']}"
            for r in rows
        ]
        vec = TfidfVectorizer(stop_words="english")
        try:
            m = vec.fit_transform(docs + [query])
        except ValueError:  # empty vocabulary
            return rows[:k]
        sims = cosine_similarity(m[-1], m[:-1]).ravel()
        order = sims.argsort()[::-1][:k]
        return [rows[i] | {"score": round(float(sims[i]), 3)} for i in order]
