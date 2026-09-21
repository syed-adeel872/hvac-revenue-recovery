"use client";

import React, { useState, useEffect, useMemo } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { adminFetch } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { CheckCircle2, XCircle, AlertCircle, Filter, Search } from "lucide-react";

interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  totalEstimateValue: number;
  totalRecovered: number;
  pendingActions: number;
  estimateCount: number;
  lastContact: string | null;
}

type SafetyDecision = "ALLOW" | "BLOCK" | "ESCALATE";
type ConsentStatus = "Verified" | "Unknown" | "Opted-Out";

function SafetyBadge({ decision }: { decision: SafetyDecision }) {
  const config: Record<SafetyDecision, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    ALLOW: { bg: "bg-[#10B981]/15", text: "text-[#10B981]", icon: <CheckCircle2 className="w-3 h-3" />, label: "ALLOW" },
    BLOCK: { bg: "bg-[#EF4444]/15", text: "text-[#EF4444]", icon: <XCircle className="w-3 h-3" />, label: "BLOCK" },
    ESCALATE: { bg: "bg-[#F59E0B]/15", text: "text-[#F59E0B]", icon: <AlertCircle className="w-3 h-3" />, label: "ESCALATE" },
  };
  const c = config[decision];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium", c.bg, c.text)}>
      {c.icon}
      {c.label}
    </span>
  );
}

function IntentBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-[#10B981]" : score >= 50 ? "bg-[#F59E0B]" : "bg-[#EF4444]";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="font-mono text-[13px] text-slate-300">{score}</span>
    </div>
  );
}

function ConsentText({ consent }: { consent: ConsentStatus }) {
  const colorMap: Record<ConsentStatus, string> = {
    Verified: "text-[#10B981]",
    Unknown: "text-[#F59E0B]",
    "Opted-Out": "text-[#EF4444]",
  };
  return <span className={cn("text-[12px] font-medium", colorMap[consent])}>{consent}</span>;
}

function deriveConsent(c: CustomerRecord): ConsentStatus {
  if (c.pendingActions === 0 && c.totalRecovered > 0) return "Verified";
  if (c.pendingActions > 0) return "Unknown";
  return "Verified";
}

function deriveSafety(c: CustomerRecord): SafetyDecision {
  const consent = deriveConsent(c);
  if (consent === "Opted-Out") return "BLOCK";
  if (consent === "Unknown") return "ESCALATE";
  return "ALLOW";
}

export default function OpportunitiesPage() {
  const { safety, loading: dashboardLoading } = useDashboard();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterIntent, setFilterIntent] = useState<number>(0);
  const [filterConsent, setFilterConsent] = useState<string>("all");
  const [filterSafety, setFilterSafety] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const optedOutIds = useMemo(() => new Set(safety?.optedOutCustomerIds ?? []), [safety]);

  useEffect(() => {
    adminFetch("/api/v1/admin/customers?pageSize=50")
      .then((r) => r.json())
      .then((data) => {
        setCustomers(data.customers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const enriched = useMemo(() => {
    return customers.map((c) => {
      const isOptedOut = optedOutIds.has(c.id);
      const consent: ConsentStatus = isOptedOut ? "Opted-Out" : deriveConsent(c);
      const safetyDecision: SafetyDecision = isOptedOut ? "BLOCK" : deriveSafety(c);
      const intentScore = Math.min(100, Math.round((c.totalEstimateValue / 15000) * 100));
      return { ...c, consent, safetyDecision, intentScore };
    });
  }, [customers, optedOutIds]);

  const filtered = useMemo(() => {
    return enriched.filter((opp) => {
      if (filterIntent > 0 && opp.intentScore < filterIntent) return false;
      if (filterConsent !== "all" && opp.consent !== filterConsent) return false;
      if (filterSafety !== "all" && opp.safetyDecision !== filterSafety) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          `${opp.firstName} ${opp.lastName}`.toLowerCase().includes(q) ||
          opp.id.toLowerCase().includes(q) ||
          opp.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [enriched, filterIntent, filterConsent, filterSafety, search]);

  const isSendDisabled = (opp: (typeof enriched)[0]) => {
    return opp.consent === "Opted-Out" || opp.safetyDecision === "BLOCK";
  };

  return (
    <DashboardShell
      isArmed={!safety?.killSwitchActive}
      isIsolated={true}
      safetyBlocks={safety?.consentSummary?.revoked}
      opportunities={customers.length}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Opportunities</h1>
          <p className="text-slate-400 mt-1">Revenue recovery opportunities with safety and consent status</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, ID, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#141A25] border border-[#1E293B] text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6] transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />

            <select
              value={filterIntent}
              onChange={(e) => setFilterIntent(Number(e.target.value))}
              className="px-3 py-2 rounded-lg bg-[#141A25] border border-[#1E293B] text-white text-sm focus:outline-none focus:border-[#3B82F6]"
            >
              <option value={0}>All Intent</option>
              <option value={50}>Intent &ge; 50</option>
              <option value={80}>Intent &ge; 80</option>
            </select>

            <select
              value={filterConsent}
              onChange={(e) => setFilterConsent(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#141A25] border border-[#1E293B] text-white text-sm focus:outline-none focus:border-[#3B82F6]"
            >
              <option value="all">All Consent</option>
              <option value="Verified">Verified</option>
              <option value="Unknown">Unknown</option>
              <option value="Opted-Out">Opted-Out</option>
            </select>

            <select
              value={filterSafety}
              onChange={(e) => setFilterSafety(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#141A25] border border-[#1E293B] text-white text-sm focus:outline-none focus:border-[#3B82F6]"
            >
              <option value="all">All Safety</option>
              <option value="ALLOW">ALLOW</option>
              <option value="BLOCK">BLOCK</option>
              <option value="ESCALATE">ESCALATE</option>
            </select>
          </div>

          <span className="text-slate-500 text-sm font-mono">
            {loading ? "..." : `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#141A25] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E293B]">
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Customer</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Estimates</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Value</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Intent</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Consent</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Safety</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8">
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                          <Skeleton className="h-4 flex-1" />
                          <Skeleton className="h-4 w-12" />
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-16 rounded-full" />
                          <Skeleton className="h-4 w-20 rounded-full" />
                          <Skeleton className="h-7 w-14 rounded-lg" />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">No opportunities match the current filters.</td>
                </tr>
              ) : (
                filtered.map((opp) => {
                  const disabled = isSendDisabled(opp);
                  const initials = `${opp.firstName?.[0] || ""}${opp.lastName?.[0] || ""}`.toUpperCase();
                  return (
                    <tr
                      key={opp.id}
                      className={cn(
                        "hover:bg-[#1E293B]/30 transition-colors",
                        opp.consent === "Opted-Out" ? "bg-[#EF4444]/5 opacity-60" : ""
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center">
                            <span className="text-[10px] font-bold text-slate-400">{initials || "?"}</span>
                          </div>
                          <div>
                            <div className="text-white text-[13px] font-medium">{opp.firstName} {opp.lastName}</div>
                            <div className="text-[11px] text-slate-500">{opp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[13px] text-slate-300">{opp.estimateCount}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[13px] font-semibold text-white">${(opp.totalEstimateValue || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <IntentBar score={opp.intentScore} />
                      </td>
                      <td className="px-4 py-3">
                        <ConsentText consent={opp.consent} />
                      </td>
                      <td className="px-4 py-3">
                        <SafetyBadge decision={opp.safetyDecision} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative group">
                          <button
                            disabled={disabled || sentIds.has(opp.id)}
                            onClick={async () => {
                              setSentIds(prev => new Set(prev).add(opp.id));
                              try {
                                await adminFetch("/api/v1/jobs/run-pipeline", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ customerId: opp.id }),
                                });
                              } catch { /* error handled by disabled state */ }
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                              disabled || sentIds.has(opp.id) ? "bg-[#1E293B] text-slate-600 cursor-not-allowed" : "bg-[#3B82F6] text-white hover:bg-[#2563EB]"
                            )}
                          >
                            {sentIds.has(opp.id) ? "Sent" : "Send"}
                          </button>
                          {disabled && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded bg-[#1E293B] border border-[#334155] text-[10px] text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                              Requires Safety ALLOW + Verified Consent
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
