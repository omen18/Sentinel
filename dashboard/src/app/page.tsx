"use client";

import React, { useEffect, useState } from "react";
import useSentinelSocket from "../hooks/useSentinelSocket";
import { useSentinelStore } from "../store/useSentinelStore";
import ModelStatusChips from "../components/ModelStatusChips";
import LiveMap from "../components/LiveMap";
import UnitsPanel from "../components/UnitsPanel";
import VideoAnalyzer from "../components/VideoAnalyzer";
import AgentConsole from "../components/AgentConsole";
import SeverityGauge from "../components/SeverityGauge";
import IncidentFeed from "../components/IncidentFeed";
import { Button } from "../components/ui/button";
import { Activity, Flame, ShieldAlert, Cpu, Navigation } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  // Establish WebSocket connection & snapshot loader
  useSentinelSocket();

  const connected = useSentinelStore((state) => state.connected);
  const stats = useSentinelStore((state) => state.stats);
  const loading = useSentinelStore((state) => state.loading);

  const [simulating, setSimulating] = useState(false);
  const [bursting, setBursting] = useState(false);
  const [time, setTime] = useState("");

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-IN", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerSimulation = async () => {
    setSimulating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Simulation request failed");
      await res.json();
    } catch (err) {
      console.error("Simulation trigger failed:", err);
    } finally {
      setSimulating(false);
    }
  };

  const triggerBurst = async () => {
    setBursting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/demo/burst?n=4`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Burst request failed");
      await res.json();
    } catch (err) {
      console.error("Burst trigger failed:", err);
    } finally {
      setBursting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-3 font-mono text-xs text-[#bd93f9]">
        <div className="text-[26px] font-black tracking-widest bg-gradient-to-r from-[#ffb86c] to-[#ff5555] bg-clip-text text-transparent animate-pulse">
          SENTINEL
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-[#bd93f9] border-t-transparent rounded-full animate-spin" />
          <span>CONNECTING TO ROAD INTEL GRID...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0a0f] p-3 text-white">
      {/* ─── Header Panel ─── */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-white/5 bg-[#0f101a] p-3 rounded-lg mb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-[#ffb86c] to-[#ff5555] bg-clip-text text-transparent uppercase leading-none">
              Sentinel
            </h1>
            <span className="text-[9px] uppercase font-bold text-[#6272a4] border border-white/10 px-1.5 py-0.5 rounded tracking-widest font-mono select-none">
              AI Emergency Grid
            </span>
          </div>
          <p className="text-[10px] text-[#6272a4] font-mono mt-1">
            Real-time Perception, Severity Assessment & Autonomous Dispatch
          </p>
        </div>

        {/* Live Metrics Summary Bar */}
        <div className="flex items-center flex-wrap gap-2 sm:ml-auto">
          {/* Total Incidents */}
          <div className="flex flex-col items-center px-3 py-1 rounded bg-white/[0.02] border border-white/5 min-w-[70px] select-none">
            <span className="text-xs font-bold text-[#bd93f9] font-mono leading-none">
              {stats.total_incidents}
            </span>
            <span className="text-[8px] uppercase text-[#6272a4] mt-1 font-mono">
              Incidents
            </span>
          </div>
          
          {/* Confirmed Collisions */}
          <div className="flex flex-col items-center px-3 py-1 rounded bg-white/[0.02] border border-white/5 min-w-[70px] select-none">
            <span className="text-xs font-bold text-[#ff5555] font-mono leading-none animate-pulse">
              {stats.confirmed}
            </span>
            <span className="text-[8px] uppercase text-[#6272a4] mt-1 font-mono">
              Collisions
            </span>
          </div>

          {/* Active Dispatches */}
          <div className="flex flex-col items-center px-3 py-1 rounded bg-white/[0.02] border border-white/5 min-w-[70px] select-none">
            <span className="text-xs font-bold text-[#50fa7b] font-mono leading-none">
              {stats.active_units}/{stats.total_units}
            </span>
            <span className="text-[8px] uppercase text-[#6272a4] mt-1 font-mono">
              Units
            </span>
          </div>

          {/* Avg Severity */}
          <div className="flex flex-col items-center px-3 py-1 rounded bg-white/[0.02] border border-white/5 min-w-[70px] select-none">
            <span className="text-xs font-bold text-[#ffb86c] font-mono leading-none">
              {stats.avg_severity.toFixed(1)}
            </span>
            <span className="text-[8px] uppercase text-[#6272a4] mt-1 font-mono">
              Avg Sev
            </span>
          </div>

          {/* Action Trigger Buttons */}
          <Button
            size="sm"
            onClick={triggerSimulation}
            disabled={simulating}
            className="h-8 px-3 font-mono text-[11px] bg-[#bd93f9] hover:bg-[#bd93f9]/80 text-[#0a0a0f] font-bold rounded cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <Activity className="w-3.5 h-3.5" />
            {simulating ? "SIMULATING..." : "SIMULATE"}
          </Button>

          <Button
            size="sm"
            onClick={triggerBurst}
            disabled={bursting}
            className="h-8 px-3 font-mono text-[11px] bg-transparent hover:bg-white/5 text-[#ff5555] border border-[#ff5555]/30 rounded font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <Flame className="w-3.5 h-3.5" />
            {bursting ? "BURSTING..." : "BURST DEMO"}
          </Button>

          <Link
            href="/drive"
            className="h-8 px-3 font-mono text-[11px] bg-transparent hover:bg-white/5 text-[#8be9fd] border border-[#8be9fd]/30 rounded font-bold cursor-pointer flex items-center gap-1 transition-all"
          >
            <Navigation className="w-3.5 h-3.5 rotate-45" />
            DRIVE HUD
          </Link>

          {/* Clock & WebSocket status */}
          <div className="flex items-center gap-2 border border-white/10 px-2 py-1 h-8 rounded bg-black/20 font-mono text-[11px] select-none">
            <span className="text-[#6272a4] font-bold">{time}</span>
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connected ? "bg-[#50fa7b] animate-pulse" : "bg-[#ff5555]"
              }`}
              title={connected ? "Websocket Active" : "Websocket Disconnected"}
            />
          </div>
        </div>
      </header>

      {/* ─── Main Dashboard Grid ─── */}
      <main className="flex-grow grid grid-cols-12 gap-3 min-h-0">
        
        {/* Left Column — Network Topology & Unit Registry (span 3) */}
        <section className="col-span-12 lg:col-span-3 flex flex-col gap-3 min-h-0">
          <ModelStatusChips />
          <LiveMap />
          <UnitsPanel />
        </section>

        {/* Center Column — Cameras & Reasoner Terminal (span 5) */}
        <section className="col-span-12 lg:col-span-5 flex flex-col gap-3 min-h-0">
          <VideoAnalyzer />
          <AgentConsole />
        </section>

        {/* Right Column — Severity Gauge & Incidents Feed (span 4) */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0">
          <SeverityGauge />
          <IncidentFeed />
        </section>

      </main>
    </div>
  );
}
