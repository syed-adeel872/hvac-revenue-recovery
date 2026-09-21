"use client"

import { useState, useEffect } from "react"
import DashboardShell from "@/components/dashboard/DashboardShell"
import { useDashboard } from "@/components/dashboard/DashboardContext"
import { adminFetch } from "@/lib/admin-auth"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/Skeleton"
import {
  ScrollText,
  Database,
  Key,
  Lock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react"

interface AuditLogEntry {
  id: string;
  client_id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function WorkerBadge({ worker }: { worker: string }) {
  const colors: Record<string, string> = {
    Intelligence: "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20",
    Recovery: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    Safety: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
    Operations: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        colors[worker] ?? "bg-slate-800/50 text-slate-400 border-slate-700"
      )}
    >
      {worker}
    </span>
  )
}

function SafetyBadge({ decision }: { decision: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; className: string }> = {
    ALLOW: {
      icon: CheckCircle2,
      className: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    },
    BLOCK: {
      icon: XCircle,
      className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
    },
    ESCALATE: {
      icon: AlertCircle,
      className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
    },
  }

  const { icon: Icon, className } = config[decision] ?? config.ALLOW

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {decision}
    </span>
  )
}

function mapActorTypeToWorker(actorType: string): string {
  const map: Record<string, string> = {
    intelligence: "Intelligence",
    recovery: "Recovery",
    safety: "Safety",
    operations: "Operations",
    user: "Operations",
    system: "Operations",
  };
  return map[actorType] || "Operations";
}

function mapActionToDecision(action: string): string {
  if (action.includes("block") || action.includes("opt_out")) return "BLOCK";
  if (action.includes("escalate") || action.includes("unknown")) return "ESCALATE";
  return "ALLOW";
}

export default function OperationsPage() {
  const { tenants } = useDashboard();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/v1/admin/audit?pageSize=20")
      .then((r) => r.json())
      .then((data) => {
        setAuditLogs(data.logs || []);
        setTotalLogs(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tenantId = tenants?.currentTenant?.id ?? "N/A";

  return (
    <DashboardShell isArmed={true} isIsolated={tenants?.allIsolated ?? true}>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Operations & Audit</h1>
          <p className="mt-1 text-sm text-slate-400">Immutable WORM audit trail with full traceability</p>
        </div>

        {/* WORM Storage Badge */}
        <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 flex items-center gap-3">
          <Database className="h-5 w-5 text-[#F59E0B]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F59E0B]">
            WORM STORAGE | S3 OBJECT LOCK | 7Y RETENTION
          </span>
        </div>

        {/* KMS Key Management */}
        <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3B82F6]/10">
              <Key className="h-4 w-4 text-[#3B82F6]" />
            </div>
            <h2 className="text-sm font-semibold text-white">KMS Key Management</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#0A0E14] p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-300">Tenant Key</span>
                  <code className="rounded bg-[#3B82F6]/10 px-1.5 py-0.5 text-[11px] font-mono text-[#3B82F6]">
                    {tenantId}
                  </code>
                </div>
                <p className="font-mono text-[11px] text-slate-500">
                  Configure via KMS_KEY_ARN environment variable
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#F59E0B]">
                <AlertCircle className="h-3 w-3" />
                Pending
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#0A0E14] p-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#F59E0B]" />
                <span className="text-xs font-medium text-slate-300">RLS row_level</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#10B981]">
                ENABLED
              </span>
            </div>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="rounded-xl border border-[#1E293B] bg-[#141A25]">
          <div className="flex items-center gap-3 border-b border-[#1E293B] p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3B82F6]/10">
              <ScrollText className="h-4 w-4 text-[#3B82F6]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Audit Log</h2>
              <p className="text-xs text-slate-500">
                {loading ? <Skeleton className="h-3 w-24 inline-block" /> : `${totalLogs} entries`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E293B]">
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">trace_id</th>
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">timestamp</th>
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">worker</th>
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">decision</th>
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">tenant_id</th>
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8">
                      <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="h-10 rounded-lg bg-[#1E293B] animate-pulse" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500 text-sm">No audit entries found</td>
                  </tr>
                ) : (
                  auditLogs.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-[#1E293B]/30">
                      <td className="px-6 py-3 font-mono text-[12px] text-[#3B82F6]">
                        {entry.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-3 font-mono text-[12px] text-slate-400">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <WorkerBadge worker={mapActorTypeToWorker(entry.actor_type)} />
                      </td>
                      <td className="px-6 py-3">
                        <SafetyBadge decision={mapActionToDecision(entry.action)} />
                      </td>
                      <td className="px-6 py-3 font-mono text-[12px] text-slate-400">
                        {entry.client_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-3 text-[13px] text-slate-300">
                        {entry.action}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Immutable Storage Note */}
        <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#141A25] p-4">
          <Lock className="h-4 w-4 text-slate-500" />
          <span className="text-[11px] text-slate-500">All audit entries are append-only. Records cannot be modified or deleted.</span>
        </div>
      </div>
    </DashboardShell>
  )
}
