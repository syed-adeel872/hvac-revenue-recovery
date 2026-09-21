"use client"

import { useState, useEffect } from "react"
import DashboardShell from "@/components/dashboard/DashboardShell"
import { useDashboard } from "@/components/dashboard/DashboardContext"
import { adminFetch } from "@/lib/admin-auth"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/Skeleton"
import { Plug, CheckCircle2, AlertCircle, Activity, RefreshCw } from "lucide-react"

interface IntegrationRecord {
  id: string;
  providerName: string;
  displayName: string;
  status: string;
  authType: string;
  config: Record<string, unknown>;
  maskedSecrets: Record<string, string>;
  credentialVersion: number;
  credentialCreatedAt: string | null;
  credentialExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_META: Record<string, { initials: string; color: string; category: string; rateLimit: string }> = {
  servicetitan: { initials: "ST", color: "#8B5CF6", category: "CRM/FSM", rateLimit: "60 req/min" },
  twilio: { initials: "TW", color: "#EF4444", category: "Messaging", rateLimit: "1 msg/sec" },
  housecall: { initials: "HC", color: "#3B82F6", category: "CRM/FSM", rateLimit: "100 req/min" },
};

function HealthBar({ status }: { status: string }) {
  const health = status === "active" ? 99.9 : status === "revoked" ? 0 : 50;
  const barColor = health >= 99 ? "#10B981" : health > 0 ? "#F59E0B" : "#EF4444";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-slate-500">Health</span>
        <span className="text-[12px] text-white font-medium">{health}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1E293B] w-full">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${health}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  if (status === "active") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#10B981]" />
        <span className="text-[12px] text-[#10B981]">Connected</span>
      </div>
    );
  }
  if (status === "revoked") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-[#EF4444]" />
        <span className="text-[12px] text-[#EF4444]">Revoked</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-2 rounded-full bg-slate-500" />
      <span className="text-[12px] text-slate-500">{status}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  const { tenants } = useDashboard();
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/v1/admin/integrations")
      .then((r) => r.json())
      .then((data) => {
        setIntegrations(data.integrations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <DashboardShell isArmed={true} isIsolated={tenants?.allIsolated ?? true}>
      <div className="min-h-screen bg-[#0A0E14]">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <Plug className="w-6 h-6 text-[#3B82F6]" />
              <h1 className="text-2xl font-bold text-white">Integrations</h1>
            </div>
            <p className="text-slate-500 text-[14px] ml-9">Connected systems and health status</p>
          </div>

          {/* Integration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-2 rounded-xl border border-[#1E293B] bg-[#141A25] p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="space-y-2.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ) : integrations.length === 0 ? (
              <div className="col-span-2 rounded-xl border border-[#1E293B] bg-[#141A25] p-8 text-center text-slate-500">
                No integrations configured. Connect a provider to get started.
              </div>
            ) : (
              integrations.map((integration) => {
                const meta = PROVIDER_META[integration.providerName] || {
                  initials: integration.providerName.substring(0, 2).toUpperCase(),
                  color: "#64748B",
                  category: "Provider",
                  rateLimit: "N/A",
                };

                return (
                  <div key={integration.id} className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="flex items-center justify-center w-10 h-10 rounded-full text-white text-[14px] font-bold"
                        style={{ backgroundColor: meta.color }}
                      >
                        {meta.initials}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white text-[14px] font-semibold">{integration.displayName}</h3>
                            <p className="text-slate-500 text-[11px]">{meta.category}</p>
                          </div>
                          <StatusDot status={integration.status} />
                        </div>
                      </div>
                    </div>

                    {/* Health Bar */}
                    <div className="mb-4">
                      <HealthBar status={integration.status} />
                    </div>

                    {/* Details */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-slate-500">Rate Limit</span>
                        <span className="text-[12px] text-white">{meta.rateLimit}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-slate-500">Auth Type</span>
                        <span className="text-[12px] text-white font-mono">{integration.authType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-slate-500">Credential Version</span>
                        <span className="text-[12px] text-white font-mono">v{integration.credentialVersion}</span>
                      </div>
                      {integration.credentialExpiresAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-slate-500">Expires</span>
                          <span className="text-[12px] text-white">{new Date(integration.credentialExpiresAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Summary Footer */}
          <div className="mt-6 flex items-center gap-6">
            <div className="flex items-center gap-2 text-[12px]">
              <Activity className="w-4 h-4 text-[#10B981]" />
              <span className="text-slate-500">
                {loading ? <Skeleton className="h-3 w-32 inline-block" /> : `${integrations.filter((i) => i.status === "active").length} active integrations`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <span className="text-slate-500">Last refreshed: just now</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
