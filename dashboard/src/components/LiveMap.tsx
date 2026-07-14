"use client";

import React, { useEffect, useState } from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Activity, ShieldAlert, Navigation } from "lucide-react";

export function LiveMap() {
  const zones = useSentinelStore((state) => state.zones);
  const edges = useSentinelStore((state) => state.edges);
  const units = useSentinelStore((state) => state.units);
  const activeRoute = useSentinelStore((state) => state.activeRoute);
  const activeIncident = useSentinelStore((state) => state.activeIncident);
  const clearActiveRoute = useSentinelStore((state) => state.clearActiveRoute);

  const [hotZones, setHotZones] = useState<string[]>([]);

  // Track incidents to flash zones that had recent incidents
  useEffect(() => {
    if (activeIncident?.zone) {
      const z = activeIncident.zone;
      setHotZones((prev) => [...prev, z]);
      const timer = setTimeout(() => {
        setHotZones((prev) => prev.filter((item) => item !== z));
      }, 15000); // hot for 15 seconds
      return () => clearTimeout(timer);
    }
  }, [activeIncident]);

  // Translate small grid to coordinate pairs for drawing SVG polylines
  const getPolylinePoints = (path: string[]) => {
    return path
      .map((z) => {
        const coord = zones[z];
        return coord ? `${coord.x},${coord.y}` : "";
      })
      .filter(Boolean)
      .join(" ");
  };

  return (
    <Card className="bg-[#0f101a] border-white/5 flex flex-col h-[340px]">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs uppercase font-mono text-[#6272a4] flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-[#bd93f9]" />
          Tactical City Grid & Router
        </CardTitle>
        {activeRoute && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearActiveRoute}
            className="h-5 px-1.5 text-[9px] font-mono text-[#ff79c6] hover:bg-[#ff79c6]/10 cursor-pointer"
          >
            Clear Route
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-2 flex-grow flex items-center justify-center relative overflow-hidden">
        {/* Ambient Grid overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(189,147,249,0.02)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <svg
          viewBox="-0.6 -0.8 8.4 6.8"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full max-h-[290px] font-mono select-none"
        >
          {/* Base Grid Edges */}
          {edges.map(([u, v], idx) => {
            const coordU = zones[u];
            const coordV = zones[v];
            if (!coordU || !coordV) return null;
            return (
              <line
                key={`edge-${idx}`}
                x1={coordU.x}
                y1={coordU.y}
                x2={coordV.x}
                y2={coordV.y}
                stroke="rgba(98, 114, 164, 0.2)"
                strokeWidth="0.04"
              />
            );
          })}

          {/* Animating A* Dispatch Route */}
          {activeRoute && activeRoute.length > 1 && (
            <>
              {/* Glow filter underlay */}
              <polyline
                points={getPolylinePoints(activeRoute)}
                fill="none"
                stroke="#ff79c6"
                strokeWidth="0.12"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.4"
                style={{ filter: "drop-shadow(0 0 4px #ff79c6)" }}
              />
              {/* Pulsing dashes overlay */}
              <polyline
                points={getPolylinePoints(activeRoute)}
                fill="none"
                stroke="#ff79c6"
                strokeWidth="0.08"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="0.3 0.15"
                className="animate-[dash_8s_linear_infinite]"
                style={{
                  strokeDashoffset: 0,
                }}
              />
            </>
          )}

          {/* City Nodes */}
          {Object.entries(zones).map(([id, { x, y }]) => {
            const isHot = hotZones.includes(id);
            const isTarget = activeIncident?.zone === id && activeRoute;
            return (
              <g key={`node-${id}`} className="group cursor-pointer">
                {/* Pulse wave for hot zones */}
                {isHot && (
                  <circle
                    cx={x}
                    cy={y}
                    r="0.4"
                    fill="none"
                    stroke="#ff5555"
                    strokeWidth="0.02"
                    className="animate-ping origin-center"
                    style={{ transformOrigin: `${x}px ${y}px` }}
                  />
                )}
                
                {/* Node circle */}
                <circle
                  cx={x}
                  cy={y}
                  r="0.25"
                  className="transition-all duration-300"
                  fill={isHot ? "#ff5555" : isTarget ? "#ff79c6" : "#0f101a"}
                  stroke={isHot ? "#ff5555" : isTarget ? "#ff79c6" : "#bd93f9"}
                  strokeWidth="0.04"
                />

                {/* Node text */}
                <text
                  x={x}
                  y={y - 0.38}
                  textAnchor="middle"
                  fontSize="0.24"
                  fontWeight="bold"
                  fill={isHot ? "#ff5555" : isTarget ? "#ff79c6" : "#6272a4"}
                  className="pointer-events-none text-[8px]"
                >
                  {id}
                </text>
              </g>
            );
          })}

          {/* Unit Markers */}
          {Object.entries(units).map(([uid, u]) => {
            const coord = zones[u.zone];
            if (!coord) return null;
            const isBusy = u.busy;
            return (
              <g key={`unit-marker-${uid}`} className="transition-all duration-500">
                {/* Glow ring if unit is busy */}
                {isBusy && (
                  <circle
                    cx={coord.x}
                    cy={coord.y + 0.38}
                    r="0.2"
                    fill="none"
                    stroke="#ff5555"
                    strokeWidth="0.02"
                    className="animate-pulse"
                  />
                )}
                {/* Unit Icon Block */}
                <rect
                  x={coord.x - 0.15}
                  y={coord.y + 0.28}
                  width="0.3"
                  height="0.2"
                  rx="0.05"
                  fill={isBusy ? "rgba(255, 85, 85, 0.25)" : "rgba(80, 250, 123, 0.2)"}
                  stroke={isBusy ? "#ff5555" : "#50fa7b"}
                  strokeWidth="0.03"
                />
                <text
                  x={coord.x}
                  y={coord.y + 0.42}
                  textAnchor="middle"
                  fontSize="0.14"
                  fontWeight="bold"
                  fill={isBusy ? "#ff5555" : "#50fa7b"}
                  className="pointer-events-none text-[5px]"
                >
                  {uid.split("-")[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* CSS Animation Keyframes */}
        <style jsx>{`
          @keyframes dash {
            to {
              stroke-dashoffset: -10;
            }
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
export default LiveMap;
