import { useEffect, useRef } from "react";
import { useSentinelStore } from "../store/useSentinelStore";

export function useSentinelSocket() {
  const setConnected = useSentinelStore((state) => state.setConnected);
  const setInitialState = useSentinelStore((state) => state.setInitialState);
  const addIncidentEvent = useSentinelStore((state) => state.addIncidentEvent);
  const updateUnitStatus = useSentinelStore((state) => state.updateUnitStatus);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 1. Fetch initial state snapshot
    const fetchInitialState = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/api/state`);
        const data = await res.json();
        setInitialState(data);
      } catch (err) {
        console.error("Failed to load initial snapshot from API:", err);
        // Graceful fallback: set empty/default state so the dashboard loads and relies on WS
        setInitialState({
          incidents: [],
          units: {
            "AMB-01": { zone: "Z-02", busy: false, type: "ambulance" },
            "AMB-02": { zone: "Z-10", busy: false, type: "ambulance" },
            "PAT-01": { zone: "Z-07", busy: false, type: "patrol" },
            "PAT-02": { zone: "Z-04", busy: false, type: "patrol" }
          },
          zones: {
            zones: {
              "Z-01": { x: 0, y: 0 }, "Z-02": { x: 2, y: 0.5 }, "Z-03": { x: 4, y: 0 }, "Z-04": { x: 6, y: 1 },
              "Z-05": { x: 1, y: 2 }, "Z-06": { x: 3, y: 2.5 }, "Z-07": { x: 5, y: 2 }, "Z-08": { x: 7, y: 3 },
              "Z-09": { x: 0.5, y: 4 }, "Z-10": { x: 2.5, y: 4.5 }, "Z-11": { x: 4.5, y: 4 }, "Z-12": { x: 6.5, y: 5 }
            },
            edges: [
              ["Z-01", "Z-02"], ["Z-02", "Z-03"], ["Z-03", "Z-04"],
              ["Z-05", "Z-06"], ["Z-06", "Z-07"], ["Z-07", "Z-08"],
              ["Z-09", "Z-10"], ["Z-10", "Z-11"], ["Z-11", "Z-12"],
              ["Z-01", "Z-05"], ["Z-05", "Z-09"], ["Z-02", "Z-06"],
              ["Z-06", "Z-10"], ["Z-03", "Z-07"], ["Z-07", "Z-11"],
              ["Z-04", "Z-08"], ["Z-08", "Z-12"]
            ]
          },
          stats: { total_incidents: 0, confirmed: 0, active_units: 0, total_units: 4, avg_severity: 0 },
          health: { status: "ok", models: {}, llm: "heuristic" }
        });
      }
    };
    fetchInitialState();

    // 2. Establish WebSocket connection
    let retryTimer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
      console.log(`Connecting to WebSocket at: ${wsUrl}`);
      
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connection established successfully");
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Received WebSocket event:", data);
          if (data.type === "incident") {
            addIncidentEvent(data.payload);
          } else if (data.type === "unit_update") {
            const { id, busy, zone } = data.payload;
            updateUnitStatus(id, busy, zone);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      socket.onclose = () => {
        console.warn("WebSocket connection closed. Retrying in 2 seconds...");
        setConnected(false);
        retryTimer = setTimeout(connect, 2000);
      };

      socket.onerror = (err) => {
        console.error("WebSocket connection error:", err);
        socket.close();
      };
    };

    connect();

    return () => {
      clearTimeout(retryTimer);
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [setConnected, setInitialState, addIncidentEvent, updateUnitStatus]);
}
export default useSentinelSocket;
