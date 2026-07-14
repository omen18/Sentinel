import { create } from "zustand";

export interface Box {
  cls: string;
  conf: number;
  xyxy: [number, number, number, number];
}

export interface Detections {
  boxes: Box[];
  collision_conf: number;
  img_size?: [number, number];
  raw_perc?: number;
}

export interface AnnResult {
  severity: number;
  response_needed: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH";
}

export interface AgentTrace {
  agent: string;
  msg: string;
  [key: string]: any;
}

export interface Incident {
  id: string;
  zone: string;
  severity: number;
  verdict: "CONFIRMED" | "FALSE_ALARM";
  priority: "LOW" | "MEDIUM" | "HIGH";
  narrative?: string;
  timestamp?: string;
}

export interface Unit {
  zone: string;
  busy: boolean;
  type: string;
}

export interface SentinelState {
  incidents: Incident[];
  units: Record<string, Unit>;
  zones: Record<string, { x: number; y: number }>;
  edges: [string, string][];
  stats: {
    total_incidents: number;
    confirmed: number;
    active_units: number;
    total_units: number;
    avg_severity: number;
  };
  health: {
    status: string;
    models: Record<string, string>;
    llm: string;
  };
  agentLogs: { id: string; agent: string; msg: string; timestamp: string; extra?: any }[];
  activeRoute: string[] | null;
  activeIncident: {
    incident_id: string;
    zone: string;
    detections: Detections;
    ann: AnnResult;
    report?: any;
    dispatch_path?: string[];
  } | null;
  connected: boolean;
  loading: boolean;

  // Actions
  setConnected: (connected: boolean) => void;
  setInitialState: (data: any) => void;
  addIncidentEvent: (incident: any) => void;
  updateUnitStatus: (unitId: string, busy: boolean, zone: string) => void;
  clearActiveRoute: () => void;
}

export const useSentinelStore = create<SentinelState>((set) => ({
  incidents: [],
  units: {},
  zones: {},
  edges: [],
  stats: {
    total_incidents: 0,
    confirmed: 0,
    active_units: 0,
    total_units: 0,
    avg_severity: 0,
  },
  health: {
    status: "unknown",
    models: {},
    llm: "unknown",
  },
  agentLogs: [],
  activeRoute: null,
  activeIncident: null,
  connected: false,
  loading: true,

  setConnected: (connected) => set({ connected }),

  setInitialState: (data) =>
    set({
      incidents: data.incidents || [],
      units: data.units || {},
      zones: data.zones?.zones || {},
      edges: data.zones?.edges || [],
      stats: data.stats || {
        total_incidents: 0,
        confirmed: 0,
        active_units: 0,
        total_units: 0,
        avg_severity: 0,
      },
      health: data.health || { status: "ok", models: {}, llm: "heuristic" },
      loading: false,
    }),

  addIncidentEvent: (payload) =>
    set((state) => {
      const { incident_id, zone, detections, ann, report, trace, dispatch_path } = payload;
      
      // 1. Create new incident item
      const isConfirmed = report?.verdict === "CONFIRMED";
      const newIncident: Incident = {
        id: incident_id,
        zone: zone,
        severity: ann.severity,
        verdict: isConfirmed ? "CONFIRMED" : "FALSE_ALARM",
        priority: ann.priority,
        narrative: report?.narrative || report?.analysis || "",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour12: false }),
      };

      // 2. Append new agent logs from trace
      const newLogs = (trace || []).map((t: any) => ({
        id: `${incident_id}-${Math.random().toString(36).substr(2, 9)}`,
        agent: t.agent,
        msg: t.msg,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour12: false }),
        extra: Object.entries(t)
          .filter(([k]) => !["agent", "msg"].includes(k))
          .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
      }));

      // 3. Update the unit busy status locally if a unit was dispatched
      const updatedUnits = { ...state.units };
      if (dispatch_path && dispatch_path.length > 0) {
        // Dispatcher reports dispatch in trace. Let's find which unit was dispatched
        const dispatchTrace = (trace || []).find((t: any) => t.agent === "dispatcher" && t.msg.includes("DISPATCHED"));
        if (dispatchTrace && dispatchTrace.unit) {
          const unitId = dispatchTrace.unit;
          if (updatedUnits[unitId]) {
            updatedUnits[unitId] = {
              ...updatedUnits[unitId],
              busy: true,
              zone: zone, // unit moves to target zone
            };
          }
        }
      }

      // 4. Update stats locally to prevent delay
      const updatedStats = {
        ...state.stats,
        total_incidents: state.stats.total_incidents + 1,
        confirmed: state.stats.confirmed + (isConfirmed ? 1 : 0),
        active_units: Object.values(updatedUnits).filter(u => u.busy).length,
      };

      return {
        incidents: [newIncident, ...state.incidents].slice(0, 30),
        agentLogs: [...state.agentLogs, ...newLogs].slice(-100),
        units: updatedUnits,
        activeRoute: dispatch_path || null,
        activeIncident: {
          incident_id,
          zone,
          detections,
          ann,
          report,
          dispatch_path,
        },
        stats: updatedStats,
      };
    }),

  updateUnitStatus: (unitId, busy, zone) =>
    set((state) => {
      const updatedUnits = { ...state.units };
      if (updatedUnits[unitId]) {
        updatedUnits[unitId] = {
          ...updatedUnits[unitId],
          busy,
          zone,
        };
      }
      return {
        units: updatedUnits,
        stats: {
          ...state.stats,
          active_units: Object.values(updatedUnits).filter(u => u.busy).length,
        },
      };
    }),

  clearActiveRoute: () => set({ activeRoute: null }),
}));
