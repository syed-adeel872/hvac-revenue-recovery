"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import type { SafetyData } from "@/lib/hooks/useDashboardData";

interface SafetySummaryProps {
  safety: SafetyData | null;
}

export default function SafetySummary({ safety }: SafetySummaryProps) {
  const consentSummary = safety?.consentSummary ?? { granted: 0, revoked: 0, pending: 0, unknown: 0, total: 0 };
  const outboundSummary = safety?.outboundSummary ?? { delivered: 0, failed: 0, pending: 0, total: 0 };

  const totalDecisions = consentSummary.granted + consentSummary.revoked + consentSummary.unknown;
  const allowPct = totalDecisions > 0 ? (consentSummary.granted / totalDecisions) * 100 : 0;
  const blockPct = totalDecisions > 0 ? (consentSummary.revoked / totalDecisions) * 100 : 0;
  const escalatePct = totalDecisions > 0 ? (consentSummary.unknown / totalDecisions) * 100 : 0;

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
      <h2 className="text-sm font-semibold text-white mb-4 tracking-[-0.01em]">Safety Summary</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-300">ALLOW</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
              <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${allowPct}%` }} />
            </div>
            <span className="text-[12px] font-semibold text-[#10B981] font-mono">{consentSummary.granted}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-300">ESCALATE</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
              <div className="h-full rounded-full bg-[#F59E0B]" style={{ width: `${escalatePct}%` }} />
            </div>
            <span className="text-[12px] font-semibold text-[#F59E0B] font-mono">{consentSummary.unknown}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-slate-300">BLOCK</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
              <div className="h-full rounded-full bg-[#EF4444]" style={{ width: `${blockPct}%` }} />
            </div>
            <span className="text-[12px] font-semibold text-[#EF4444] font-mono">{consentSummary.revoked}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-[#1E293B]">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" />
            <span>Outbound: {outboundSummary.delivered} delivered · {outboundSummary.failed} failed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
