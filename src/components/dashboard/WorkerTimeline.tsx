"use client";

import React from "react";
import type { PipelineStage } from "@/lib/hooks/useDashboardData";

interface WorkerTimelineProps {
  stages: PipelineStage[];
}

export default function WorkerTimeline({ stages }: WorkerTimelineProps) {
  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
      <h2 className="text-sm font-semibold text-white mb-4 tracking-[-0.01em]">Worker Timeline</h2>
      <div className="space-y-3">
        {stages.map((w) => (
          <div key={w.workerType} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${w.health === "degraded" ? "bg-[#F59E0B]" : w.health === "idle" ? "bg-slate-500" : "bg-[#10B981]"}`} />
              <span className="text-[13px] text-slate-300">{w.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-slate-500">{w.completed + w.pending + w.failed} tasks</span>
              <span className={`text-[11px] font-mono ${w.health === "degraded" ? "text-[#F59E0B]" : w.health === "idle" ? "text-slate-500" : "text-[#3B82F6]"}`}>
                {w.health}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
