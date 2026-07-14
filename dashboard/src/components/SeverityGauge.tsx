"use client";

import React from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Activity } from "lucide-react";

export function SeverityGauge() {
  const activeIncident = useSentinelStore((state) => state.activeIncident);
  const severity = activeIncident?.ann.severity ?? 0;
  const priority = activeIncident?.ann.priority ?? "LOW";

  const getSeverityColor = (score: number) => {
    if (score > 60) return "#ff5555"; // Dracula Red
    if (score > 35) return "#ffb86c"; // Dracula Orange
    return "#50fa7b"; // Dracula Green
  };

  const getPriorityBadgeClass = (p: string) => {
    switch (p) {
      case "HIGH":
        return "bg-[#ff5555]/10 text-[#ff5555] border-[#ff5555]/30";
      case "MEDIUM":
        return "bg-[#ffb86c]/10 text-[#ffb86c] border-[#ffb86c]/30";
      default:
        return "bg-[#50fa7b]/10 text-[#50fa7b] border-[#50fa7b]/30";
    }
  };

  // SVG Radial Math
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (severity / 100) * circumference;
  const activeColor = getSeverityColor(severity);

  return (
    <Card className="bg-[#0f101a] border-white/5 flex flex-col h-[180px] overflow-hidden">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs uppercase font-mono text-[#6272a4] flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#bd93f9]" />
          Severity Index (SeverityNet)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex-grow flex items-center justify-center gap-6">
        
        {/* Circular Gauge */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="stroke-white/[0.03] fill-transparent"
              strokeWidth="6"
            />
            {/* Active Gauge Circle */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="fill-transparent transition-all duration-1000 ease-out"
              stroke={activeColor}
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          
          {/* Inner Value Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center font-mono select-none">
            <span className="text-2xl font-bold text-[#f8f8f2] leading-none">
              {Math.round(severity)}
            </span>
            <span className="text-[8px] uppercase text-[#6272a4] mt-0.5">
              Score
            </span>
          </div>
        </div>

        {/* Info Metrics details */}
        <div className="flex flex-col font-mono text-xs gap-1.5">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-[#6272a4]">Calculated Risk</span>
            <span className="text-[13px] font-bold text-[#f8f8f2]">
              {severity > 60 ? "CRITICAL RISK" : severity > 35 ? "ELEVATED RISK" : "NORMAL STABILITY"}
            </span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[9px] uppercase text-[#6272a4] mb-1">Priority Dispatch</span>
            <Badge variant="outline" className={`h-5 px-1.5 text-[9px] rounded font-bold uppercase select-none ${getPriorityBadgeClass(priority)}`}>
              {priority}
            </Badge>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
export default SeverityGauge;
