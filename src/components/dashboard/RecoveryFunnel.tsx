"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/lib/hooks/useDashboardData";

interface RecoveryFunnelProps {
  stages: PipelineStage[];
  unprocessedEvents: number;
}

export default function RecoveryFunnel({ stages, unprocessedEvents }: RecoveryFunnelProps) {
  const funnelStages = [
    { label: "Event Ingested", value: unprocessedEvents || 0, sub: "Housecall Pro + ServiceTitan webhooks" },
    ...stages.map((s) => ({
      label: s.name,
      value: s.completed + s.pending + s.failed,
      sub: `${s.pending} pending · ${s.failed} failed`,
    })),
  ];

  const maxValue = Math.max(...funnelStages.map((s) => s.value), 1);

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold text-white tracking-tight">Recovery Funnel</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">event_ingested → booked · last 7d</p>
        </div>
        <button className="rounded-full border border-[#1E293B] bg-[#0A0E14] px-3 py-1 text-[11px] text-slate-400 hover:text-white">
          View traces
        </button>
      </div>
      <div className="space-y-3">
        {funnelStages.map((stage, idx) => {
          const widthPct = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
          const isLast = idx === funnelStages.length - 1;
          return (
            <div key={stage.label} className="group relative">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#1E293B] bg-[#0A0E14] text-[10px] font-mono text-slate-400">
                    {idx + 1}
                  </span>
                  <span className="text-[12px] font-medium text-slate-200">{stage.label}</span>
                  <span className="hidden sm:inline text-[10px] text-slate-500 font-mono">→ {stage.sub}</span>
                </div>
                <span className="text-[12px] font-mono font-semibold text-white">{stage.value}</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#0A0E14] border border-[#1E293B]/60">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                    isLast
                      ? "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                      : idx >= 3
                      ? "bg-amber-400/80"
                      : "bg-[#3B82F6]"
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              {!isLast && <div className="ml-3 mt-1 h-3 w-px bg-[#1E293B]" />}
            </div>
          );
        })}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-[#0A0E14] border border-[#1E293B] p-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Drop-off</div>
          <div className="text-[12px] font-mono text-slate-200">
            {unprocessedEvents > 0 ? `${Math.round(((maxValue - unprocessedEvents) / maxValue) * 100)}%` : "0%"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Failed</div>
          <div className="text-[12px] font-mono text-amber-300">
            {stages.reduce((sum, s) => sum + s.failed, 0)} events
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Completed</div>
          <div className="text-[12px] font-mono text-emerald-400">
            {stages.reduce((sum, s) => sum + s.completed, 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
