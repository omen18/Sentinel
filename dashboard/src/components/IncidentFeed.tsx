"use client";

import React from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ShieldAlert, CheckCircle2, AlertOctagon } from "lucide-react";

export function IncidentFeed() {
  const incidents = useSentinelStore((state) => state.incidents);

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "border-l-4 border-l-[#ff5555] border-white/5";
      case "MEDIUM":
        return "border-l-4 border-l-[#ffb86c] border-white/5";
      default:
        return "border-l-4 border-l-[#50fa7b] border-white/5";
    }
  };

  const getVerdictIcon = (verdict: string) => {
    if (verdict === "CONFIRMED") {
      return <AlertOctagon className="w-3.5 h-3.5 text-[#ff5555]" />;
    }
    return <CheckCircle2 className="w-3.5 h-3.5 text-[#50fa7b]" />;
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "HIGH":
        return "text-[#ff5555]";
      case "MEDIUM":
        return "text-[#ffb86c]";
      default:
        return "text-[#50fa7b]";
    }
  };

  return (
    <Card className="bg-[#0f101a] border-white/5 flex flex-col h-[390px] overflow-hidden">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs uppercase font-mono text-[#6272a4] flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-[#bd93f9]" />
          Incident Log Feed
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex-grow overflow-y-auto min-h-0">
        <div className="space-y-2">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className={`p-2.5 rounded bg-white/[0.01] border ${getPriorityBorder(
                inc.priority
              )} transition-all hover:bg-white/[0.03]`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] mb-1.5 select-none">
                <div className="flex items-center gap-1.5">
                  {getVerdictIcon(inc.verdict)}
                  <span className="font-bold text-[#f8f8f2]">{inc.id}</span>
                  <Badge className="h-4 px-1.5 bg-[#bd93f9]/10 text-[#bd93f9] border-[#bd93f9]/30 text-[8px] rounded select-none">
                    {inc.zone}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#6272a4]">SEV:</span>
                  <span className={`font-bold ${getPriorityColor(inc.priority)}`}>
                    {inc.severity.toFixed(0)}
                  </span>
                </div>
              </div>
              <p className="text-[10px] font-sans text-[#6272a4] leading-relaxed select-text whitespace-pre-wrap">
                {inc.narrative || "Heuristic decision reached. Dispatched unit response active."}
              </p>
            </div>
          ))}
          {incidents.length === 0 && (
            <div className="flex flex-col items-center justify-center h-52 text-[11px] font-mono text-[#6272a4]">
              <span>No incidents on record.</span>
              <span className="text-[9px] text-[#6272a4]/60 mt-1">
                Click "Simulate" to trigger incident loops.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
export default IncidentFeed;
