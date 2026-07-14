"use client";

import React, { useState } from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Truck, RotateCcw, AlertTriangle } from "lucide-react";

export function UnitsPanel() {
  const units = useSentinelStore((state) => state.units);
  const [releasing, setReleasing] = useState<string | null>(null);

  const handleRelease = async (unitId: string) => {
    setReleasing(unitId);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/units/${unitId}/release`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to release unit");
      }
      // Note: The websocket broadcast from the backend will update the local Zustand store state!
    } catch (err) {
      console.error(`Error releasing unit ${unitId}:`, err);
    } finally {
      setReleasing(null);
    }
  };

  return (
    <Card className="bg-[#0f101a] border-white/5 flex flex-col h-[230px]">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs uppercase font-mono text-[#6272a4] flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-[#bd93f9]" />
          Patrol Units Registry
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex-grow overflow-y-auto">
        <div className="space-y-1.5">
          {Object.entries(units).map(([uid, u]) => {
            const isBusy = u.busy;
            return (
              <div
                key={uid}
                className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.04] text-[11px] font-mono hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isBusy ? "bg-[#ff5555] animate-pulse" : "bg-[#50fa7b]"
                    }`}
                  />
                  <span className="font-bold text-[#f8f8f2]">{uid}</span>
                  <span className="text-[#6272a4]">|</span>
                  <span className="text-[#6272a4] capitalize">{u.type}</span>
                  <span className="text-[#6272a4]">|</span>
                  <span className="text-[#8be9fd]">{u.zone}</span>
                </div>
                <div>
                  {isBusy ? (
                    <div className="flex items-center gap-1.5">
                      <Badge className="h-5 px-1.5 bg-[#ff5555]/10 text-[#ff5555] border-[#ff5555]/30 text-[9px] rounded font-bold uppercase select-none">
                        Engaged
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => handleRelease(uid)}
                        disabled={releasing === uid}
                        className="h-5 px-2 text-[9px] font-mono bg-[#6272a4]/20 hover:bg-[#6272a4]/40 text-[#f8f8f2] border border-white/10 hover:border-[#bd93f9]/50 rounded cursor-pointer disabled:opacity-50 flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        {releasing === uid ? "..." : "Free"}
                      </Button>
                    </div>
                  ) : (
                    <Badge className="h-5 px-1.5 bg-[#50fa7b]/10 text-[#50fa7b] border-[#50fa7b]/30 text-[9px] rounded font-bold uppercase select-none">
                      Ready
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
          {Object.keys(units).length === 0 && (
            <div className="flex items-center justify-center h-28 text-[11px] font-mono text-[#6272a4]">
              No units connected to registry.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
export default UnitsPanel;
