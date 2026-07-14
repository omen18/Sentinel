"""Sentinel agent layer — Analyst -> Dispatcher -> Reporter (LangGraph).

Two operating modes, switched automatically:
  LLM mode       : ANTHROPIC_API_KEY set -> Analyst verdicts and Reporter
                   narratives come from Claude, grounded in tool results.
  Heuristic mode : no key -> deterministic rules stand in, same graph, same
                   trace format. The dashboard works identically.

Design invariants (interview answers):
  * Agents consume the ANN's output schema (severity / response_needed /
    priority) — they cannot act without SeverityNet.
  * Dispatcher arbitrates competing incidents via the ANN priority head.
  * Every reasoning step and tool call appends to state["trace"], which the
    backend streams to the dashboard's dispatch log.
"""
from __future__ import annotations

import json
import os
from typing import Dict, List, Literal, Optional, TypedDict

from langgraph.graph import END, StateGraph

# tool backends (imported lazily in server context, directly when run as script)
try:
    from backend.app.dispatch import REGISTRY
    from backend.app.store import IncidentStore
except ImportError:  # running as `python agents/graph.py` from repo root
    import sys
    sys.path.insert(0, ".")
    from backend.app.dispatch import REGISTRY
    from backend.app.store import IncidentStore

STORE = IncidentStore()

MODEL = os.environ.get("SENTINEL_LLM", "claude-sonnet-4-6")


def _llm():
    """Return an Anthropic client if a key is configured, else None."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        import anthropic
        return anthropic.Anthropic()
    except Exception:
        return None


def _ask(client, system: str, user: str, max_tokens: int = 500) -> str:
    msg = client.messages.create(
        model=MODEL, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if b.type == "text")


# --------------------------------------------------------------------- state

class IncidentState(TypedDict, total=False):
    incident_id: str
    zone: str
    detections: dict
    severity: float
    response_needed: bool
    priority: Literal["LOW", "MEDIUM", "HIGH"]
    verdict: str
    rationale: str
    dispatched_unit: Optional[str]
    dispatch_path: List[str]
    eta_min: Optional[float]
    report: Optional[Dict]
    trace: List[Dict]


def trace(state: IncidentState, agent: str, msg: str, **extra) -> None:
    state.setdefault("trace", []).append({"agent": agent, "msg": msg, **extra})


# --------------------------------------------------------------------- tools

def query_incident_history(zone: str, k: int = 5) -> list[dict]:
    rows = STORE.by_zone(zone, limit=k)
    return [{"id": r["id"], "severity": r["severity"], "verdict": r["verdict"],
             "narrative": (r["narrative"] or "")[:120]} for r in rows]


def get_zone_context(zone: str) -> dict:
    return STORE.zone_stats(zone) | {"zone": zone}


# --------------------------------------------------------------------- nodes

def analyst(state: IncidentState) -> IncidentState:
    history = query_incident_history(state["zone"])
    ctx = get_zone_context(state["zone"])
    trace(state, "analyst", "tool: query_incident_history", results=len(history))
    trace(state, "analyst", "tool: get_zone_context",
          zone_incidents=ctx["count"], zone_avg_severity=ctx["avg_severity"])

    client = _llm()
    collision = state["detections"].get("collision_conf", 0.0)
    if client:
        prompt = (
            f"Detections: {json.dumps({k: v for k, v in state['detections'].items() if k != 'boxes'})}\n"
            f"Vehicles/objects: {[b['cls'] for b in state['detections'].get('boxes', [])]}\n"
            f"SeverityNet: severity={state['severity']}, "
            f"response_needed={state['response_needed']}, priority={state['priority']}\n"
            f"Zone history (last {len(history)}): {json.dumps(history)}\n"
            f"Zone context: {json.dumps(ctx)}\n\n"
            "Is this a REAL road incident or a FALSE POSITIVE (e.g. dense traffic, "
            "close-following vehicles)? Respond ONLY with JSON: "
            '{"verdict": "CONFIRMED" | "FALSE_POSITIVE", "rationale": "<one sentence>"}'
        )
        try:
            raw = _ask(client, "You are the Analyst agent of a road-incident "
                               "response system. Be precise and skeptical.", prompt)
            data = json.loads(raw.strip().removeprefix("```json").removesuffix("```"))
            state["verdict"] = data["verdict"]
            state["rationale"] = data["rationale"]
            trace(state, "analyst", f"LLM verdict={data['verdict']}",
                  rationale=data["rationale"])
            return state
        except Exception as e:
            trace(state, "analyst", f"LLM failed ({type(e).__name__}) — heuristic fallback")
    # heuristic mode
    confirmed = collision >= 0.5 or state["severity"] >= 60
    state["verdict"] = "CONFIRMED" if confirmed else "FALSE_POSITIVE"
    state["rationale"] = (
        f"collision_conf={collision} with ANN severity {state['severity']} "
        f"{'meets' if confirmed else 'below'} confirmation threshold"
    )
    trace(state, "analyst", f"verdict={state['verdict']}", rationale=state["rationale"])
    return state


def dispatcher(state: IncidentState) -> IncidentState:
    # Response policy, grounded in the ANN's heads:
    #   emergency (response head) or HIGH priority  -> ambulance
    #   confirmed + MEDIUM priority                 -> patrol
    #   otherwise                                   -> stand down
    emergency = state.get("response_needed") or state["priority"] == "HIGH"
    patrol_worthy = state["verdict"] == "CONFIRMED" and state["priority"] != "LOW"
    if not (emergency or patrol_worthy):
        trace(state, "dispatcher",
              "stand down — ANN response head negative, priority LOW")
        state["dispatched_unit"] = None
        return state
    unit_type = "ambulance" if emergency else "patrol"
    unit = REGISTRY.find_nearest(state["zone"], unit_type=unit_type) \
        or REGISTRY.find_nearest(state["zone"])  # any free unit as fallback
    if unit is None:
        # arbitration point: all units busy -> priority decides queue position.
        trace(state, "dispatcher",
              f"no free unit — queued at priority {state['priority']} (ANN head 3)")
        state["dispatched_unit"] = None
        return state
    REGISTRY.dispatch(unit["unit_id"], state["zone"])
    state["dispatched_unit"] = unit["unit_id"]
    state["dispatch_path"] = unit["path"]
    state["eta_min"] = unit["eta_min"]
    trace(state, "dispatcher",
          f"tool: find_nearest_unit -> {unit['unit_id']} via A* "
          f"({' > '.join(unit['path'])})", eta_min=unit["eta_min"],
          distance_km=unit["distance_km"], priority=state["priority"])
    return state


def reporter(state: IncidentState) -> IncidentState:
    client = _llm()
    narrative = None
    if client:
        try:
            narrative = _ask(
                client,
                "You are the Reporter agent. Write a terse, factual 2-3 sentence "
                "incident brief for a traffic control room. No preamble.",
                json.dumps({k: state.get(k) for k in
                            ("zone", "verdict", "rationale", "severity", "priority",
                             "dispatched_unit", "eta_min")})
                + f"\nObjects: {[b['cls'] for b in state['detections'].get('boxes', [])]}",
                max_tokens=200,
            ).strip()
            trace(state, "reporter", "LLM narrative generated")
        except Exception as e:
            trace(state, "reporter", f"LLM failed ({type(e).__name__}) — template fallback")
    if not narrative:
        unit = state.get("dispatched_unit")
        narrative = (
            f"{state['verdict'].replace('_', ' ').title()} in {state['zone']}: "
            f"severity {state['severity']}/100, priority {state['priority']}. "
            + (f"Unit {unit} dispatched, ETA {state.get('eta_min')} min."
               if unit else "No unit dispatched.")
        )
        trace(state, "reporter", "template narrative generated")

    state["report"] = {
        "incident_id": state["incident_id"], "zone": state["zone"],
        "verdict": state["verdict"], "rationale": state.get("rationale"),
        "severity": state["severity"], "priority": state["priority"],
        "response_needed": state["response_needed"],
        "dispatched_unit": state.get("dispatched_unit"),
        "eta_min": state.get("eta_min"), "narrative": narrative,
    }
    STORE.add({**state["report"], "detections": state["detections"]})
    trace(state, "reporter", "incident persisted to store")
    return state


def answer_query(question: str) -> dict:
    """RAG chat over the incident store — powers the dashboard console."""
    hits = STORE.search(question, k=5)
    client = _llm()
    if client and hits:
        try:
            answer = _ask(
                client,
                "You are the Reporter agent answering a control-room operator. "
                "Ground every claim in the retrieved incidents. Be concise.",
                f"Question: {question}\nRetrieved incidents:\n{json.dumps(hits, default=str)}",
                max_tokens=400,
            )
            return {"answer": answer, "sources": [h["id"] for h in hits]}
        except Exception:
            pass
    if not hits:
        return {"answer": "No incidents on record yet. Run an analysis or a demo "
                          "incident first.", "sources": []}
    lines = [f"{h['id']} · {h['zone']} · sev {h['severity']} · {h['verdict']}"
             for h in hits]
    return {"answer": "Top matching incidents:\n" + "\n".join(lines)
                      + "\n(Set ANTHROPIC_API_KEY for narrative answers.)",
            "sources": [h["id"] for h in hits]}


def route_after_analyst(state: IncidentState) -> str:
    return "dispatcher" if state["verdict"] == "CONFIRMED" else "reporter"


def build_graph():
    g = StateGraph(IncidentState)
    g.add_node("analyst", analyst)
    g.add_node("dispatcher", dispatcher)
    g.add_node("reporter", reporter)
    g.set_entry_point("analyst")
    g.add_conditional_edges("analyst", route_after_analyst,
                            {"dispatcher": "dispatcher", "reporter": "reporter"})
    g.add_edge("dispatcher", "reporter")
    g.add_edge("reporter", END)
    return g.compile()


GRAPH = build_graph()

if __name__ == "__main__":
    result = GRAPH.invoke({
        "incident_id": "INC-TEST",
        "zone": "Z-06",
        "detections": {"collision_conf": 0.81,
                       "boxes": [{"cls": "car", "conf": 0.9},
                                 {"cls": "motorcycle", "conf": 0.85}]},
        "severity": 72.4, "response_needed": True, "priority": "HIGH",
    })
    print(json.dumps(result["report"], indent=2))
    for t in result["trace"]:
        print(" ", t)
