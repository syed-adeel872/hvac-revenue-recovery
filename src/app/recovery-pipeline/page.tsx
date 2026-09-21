"use client";

import React, { useState, useEffect } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { adminFetch } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { Send, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface ActionRecord {
  id: string;
  clientId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  workerType: string;
  actionType: string;
  riskLevel: string;
  status: string;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

type SafetyDecision = "ALLOW" | "BLOCK" | "ESCALATE";
type PipelineStage = "drafted" | "safety_check" | "approved" | "sent" | "booked";

const COLUMNS: { key: PipelineStage; label: string }[] = [
  { key: "drafted", label: "Drafted" },
  { key: "safety_check", label: "Safety Check" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "booked", label: "Booked" },
];

function mapActionToStage(action: ActionRecord): PipelineStage {
  if (action.status === "completed") return "booked";
  if (action.status === "executing") return "sent";
  if (action.status === "approved") return "approved";
  if (action.status === "rejected") return "safety_check";
  if (action.approvalRequired && action.status === "pending") return "safety_check";
  return "drafted";
}

function SafetyBadge({ decision }: { decision: SafetyDecision }) {
  const styles: Record<SafetyDecision, string> = {
    ALLOW: "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/20",
    BLOCK: "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/20",
    ESCALATE: "bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/20",
  };
  const icons: Record<SafetyDecision, React.ReactNode> = {
    ALLOW: <CheckCircle2 className="h-3 w-3" />,
    BLOCK: <XCircle className="h-3 w-3" />,
    ESCALATE: <AlertCircle className="h-3 w-3" />,
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", styles[decision])}>
      {icons[decision]}
      {decision}
    </span>
  );
}

function ActionCard({ action }: { action: ActionRecord }) {
  const stage = mapActionToStage(action);
  const isBooked = stage === "booked";
  const isApproved = stage === "approved";
  const safety: SafetyDecision = action.riskLevel === "red" ? "BLOCK" : action.riskLevel === "yellow" ? "ESCALATE" : "ALLOW";
  const canSend = safety === "ALLOW" && action.status !== "rejected";

  return (
    <div className={cn(
      "rounded-lg border border-[#1E293B] bg-[#0A0E14] p-4 space-y-2 hover:border-[#3B82F6]/30 transition",
      action.status === "rejected" && "border-l-2 border-l-[#EF4444] bg-[#EF4444]/5"
    )}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-slate-400">{action.id.substring(0, 8)}</span>
        <span className="rounded-full bg-[#1E293B] px-2 py-0.5 text-xs text-slate-300">
          {action.workerType}
        </span>
      </div>

      <p className="text-sm text-slate-200 font-medium">{action.customerName}</p>
      <p className="text-xs text-slate-500">{action.actionType}</p>

      <div className="flex items-center justify-between">
        <SafetyBadge decision={safety} />
        <span className={cn("text-xs font-medium",
          action.status === "completed" ? "text-[#10B981]" :
          action.status === "rejected" ? "text-[#EF4444]" :
          "text-[#F59E0B]"
        )}>
          {action.status}
        </span>
      </div>

      <div className="pt-1 border-t border-[#1E293B]">
        <p className="font-mono text-xs text-slate-500">risk: {action.riskLevel}</p>
      </div>

      {isApproved && (
        <div className="relative group mt-2">
          <button
            disabled={!canSend}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
              canSend ? "bg-[#3B82F6] text-white hover:bg-[#2563EB]" : "bg-[#1E293B] text-slate-600 cursor-not-allowed"
            )}
          >
            <Send className="h-3 w-3" />
            Send
          </button>
          {!canSend && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155] text-[11px] text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10">
              Requires Safety ALLOW + Verified Consent
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1E293B] border-r border-b border-[#334155] rotate-45 -mt-1" />
            </div>
          )}
        </div>
      )}

      {isBooked && (
        <div className="mt-2 flex items-center justify-center rounded-full bg-[#10B981]/15 px-3 py-1 text-xs font-medium text-[#10B981] border border-[#10B981]/20">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Verified from CRM
        </div>
      )}
    </div>
  );
}

export default function RecoveryPipelinePage() {
  const { safety, loading: dashboardLoading } = useDashboard();
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminFetch("/api/v1/admin/actions?status=pending&pageSize=50").then((r) => r.json()),
      adminFetch("/api/v1/admin/actions?status=completed&pageSize=50").then((r) => r.json()),
      adminFetch("/api/v1/admin/actions?status=failed&pageSize=20").then((r) => r.json()),
    ])
      .then(([pending, completed, failed]) => {
        const all = [
          ...(pending.actions || []),
          ...(completed.actions || []),
          ...(failed.actions || []),
        ];
        setActions(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const cardsByStage = COLUMNS.map((col) => ({
    ...col,
    cards: actions.filter((a) => mapActionToStage(a) === col.key),
  }));

  return (
    <DashboardShell
      isArmed={!safety?.killSwitchActive}
      isIsolated={true}
      safetyBlocks={safety?.consentSummary?.revoked}
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Recovery Pipeline</h1>
          <p className="text-sm text-slate-400">Kanban view of message drafts through safety to booking</p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#141A25] px-4 py-2 text-xs text-slate-400">
          <AlertCircle className="h-3.5 w-3.5 text-[#F59E0B]" />
          <span>
            Send button requires <span className="font-medium text-[#10B981]">Safety ALLOW</span> +{" "}
            <span className="font-medium text-[#10B981]">Verified Consent</span>
          </span>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {cardsByStage.map((col) => (
            <div
              key={col.key}
              className="flex min-w-[300px] flex-1 flex-col rounded-xl border border-[#1E293B] bg-[#141A25]"
            >
              <div className="flex items-center justify-between border-b border-[#1E293B] px-4 py-3">
                <h2 className="text-sm font-semibold text-white">{col.label}</h2>
                <span className="rounded-full bg-[#1E293B] px-2 py-0.5 text-xs text-slate-300">
                  {col.cards.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-3">
                {loading ? (
                  <div className="space-y-3 py-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="rounded-lg border border-[#1E293B] bg-[#0A0E14] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-4 w-14 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-5 w-20 rounded-full" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : col.cards.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-600">No cards</p>
                ) : (
                  col.cards.map((card) => (
                    <ActionCard key={card.id} action={card} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
