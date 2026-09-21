"use client";

import { useState, useEffect } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { adminFetch } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Building2,
  Shield,
  Settings,
  Users,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
} from "lucide-react";

interface TenantMember {
  id: string;
  user_id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface TableIsolation {
  name: string;
  count: number;
  isolated: boolean;
}

const roleBadgeColors: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  admin: "bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30",
  member: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  viewer: "bg-slate-500/10 text-slate-400 border border-slate-500/30",
};

export default function TenantsPage() {
  const { tenants, loading: dashboardLoading } = useDashboard();
  const [maxActionsPerHour] = useState(40);
  const [autoApprove, setAutoApprove] = useState(false);
  const [consentRequired, setConsentRequired] = useState(true);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);

  useEffect(() => {
    if (tenants?.currentTenant) {
      setKillSwitchEnabled(tenants.currentTenant.kill_switch_enabled ?? false);
    }
  }, [tenants]);

  const members: TenantMember[] = tenants?.members ?? [];
  const tableIsolation: TableIsolation[] = tenants?.tableIsolation ?? [];
  const tenantName = tenants?.currentTenant?.display_name || tenants?.currentTenant?.name || "N/A";
  const allIsolated = tenants?.allIsolated ?? false;

  return (
    <DashboardShell isArmed={!killSwitchEnabled} isIsolated={allIsolated}>
      <div className="min-h-screen bg-[#0A0E14] px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white">Tenants & Settings</h1>
            <p className="mt-1 text-sm text-slate-400">Multi-tenant isolation and configuration</p>
          </div>

          {/* Tenant Isolation Proof */}
          <div className="rounded-2xl border border-[#1E293B] bg-[#141A25] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#10B981]" />
              <h2 className="text-lg font-semibold text-white">Tenant Isolation</h2>
            </div>

            <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[#10B981]/30 bg-[#10B981]/5 p-4">
              <Shield className="h-5 w-5 text-[#10B981]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#10B981]">
                {allIsolated ? "ISOLATED" : "NOT ISOLATED"}
              </span>
            </div>

            <div className="mb-2 text-[13px] text-white font-medium">{tenantName}</div>
            <p className="mb-4 text-[12px] text-slate-500">Every tenant remains isolated per AGENTS.md Rule #16</p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tableIsolation.map((t) => (
                <div key={t.name} className="flex items-center gap-2">
                  <CheckCircle2 className={cn("h-3.5 w-3.5", t.isolated ? "text-[#10B981]" : "text-[#EF4444]")} />
                  <span className="text-[13px] text-slate-300">{t.name}</span>
                  <span className="text-[11px] text-slate-500 font-mono">({t.count})</span>
                </div>
              ))}
              {tableIsolation.length === 0 && !dashboardLoading && (
                <p className="text-[13px] text-slate-500 col-span-3">No table isolation data available</p>
              )}
            </div>
          </div>

          {/* Tenant Members */}
          <div className="rounded-2xl border border-[#1E293B] bg-[#141A25] p-6">
            <div className="mb-5 flex items-center gap-2">
              <Users className="h-5 w-5 text-[#3B82F6]" />
              <h2 className="text-lg font-semibold text-white">Tenant Members</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1E293B]">
                    <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</th>
                    <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Role</th>
                    <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[13px] text-slate-500">
                        {dashboardLoading ? (
                          <div className="space-y-3">
                            {[...Array(3)].map((_, i) => (
                              <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-4 flex-1" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                                <Skeleton className="h-3 w-16" />
                              </div>
                            ))}
                          </div>
                        ) : "No members found"}
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr key={member.id}>
                        <td className="py-3 text-[13px] text-slate-300">{member.email}</td>
                        <td className="py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                              roleBadgeColors[member.role] ?? roleBadgeColors.viewer
                            )}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center gap-1 text-[12px] text-[#10B981]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                            {member.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tenant Controls */}
          <div className="rounded-2xl border border-[#1E293B] bg-[#141A25] p-6">
            <div className="mb-5 flex items-center gap-2">
              <Settings className="h-5 w-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Tenant Controls</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-4 py-3">
                <span className="text-[13px] text-slate-300">max_actions_per_hour</span>
                <div className="flex items-center gap-3">
                  <div className="relative h-2 w-32 overflow-hidden rounded-full bg-[#1E293B]">
                    <div className="absolute left-0 top-0 h-full rounded-full bg-[#3B82F6]" style={{ width: `${maxActionsPerHour}%` }} />
                  </div>
                  <span className="min-w-[3rem] text-right text-[13px] font-medium text-white">{maxActionsPerHour}/100</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-4 py-3">
                <span className="text-[13px] text-slate-300">auto_approve</span>
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
                  autoApprove ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#EF4444]/10 text-[#EF4444]"
                )}>
                  {autoApprove ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {autoApprove ? "ON" : "OFF"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-4 py-3">
                <span className="text-[13px] text-slate-300">consent_required</span>
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
                  consentRequired ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#EF4444]/10 text-[#EF4444]"
                )}>
                  {consentRequired ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {consentRequired ? "ON" : "OFF"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-4 py-3">
                <span className="text-[13px] text-slate-300">kill_switch_enabled</span>
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
                  killSwitchEnabled ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#EF4444]/10 text-[#EF4444]"
                )}>
                  {killSwitchEnabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {killSwitchEnabled ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>

          {/* Offboarding - Danger Zone */}
          <div className="rounded-2xl border border-[#EF4444]/30 bg-[#141A25] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-[#EF4444]" />
              <h2 className="text-lg font-semibold text-[#EF4444]">Danger Zone</h2>
            </div>

            <p className="mb-5 text-[13px] text-slate-400">Offboard this tenant and all associated data</p>

            <button
              onClick={() => window.alert("Offboarding is not yet implemented. Contact the project owner.")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#EF4444] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#DC2626]"
            >
              <Trash2 className="h-4 w-4" />
              Offboard Tenant
            </button>

            <p className="mt-3 text-[11px] text-[#EF4444]">This action cannot be undone</p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
