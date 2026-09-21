"use client";

import { useState, useEffect } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { adminFetch } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  XCircle,
  Lock,
} from "lucide-react";

interface OptOutKeyword {
  id: string;
  keyword: string;
  channel: string;
  is_active: boolean;
  created_at: string;
}

export default function SafetyPage() {
  const { safety, loading: dashboardLoading } = useDashboard();
  const [killSwitchArmed, setKillSwitchArmed] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [toggling, setToggling] = useState(false);
  const [optOutKeywords, setOptOutKeywords] = useState<OptOutKeyword[]>([]);

  useEffect(() => {
    if (safety) {
      setKillSwitchArmed(safety.killSwitchActive);
      setOptOutKeywords(safety.optOutKeywords || []);
    }
  }, [safety]);

  const handleKillSwitchClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    if (confirmInput !== "DISABLE") return;
    setToggling(true);
    try {
      const res = await adminFetch("/api/v1/admin/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: !killSwitchArmed,
          ...(!killSwitchArmed ? { confirmation: "DISABLE" } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setKillSwitchArmed(data.globalEnabled);
      }
    } catch {
      // silently fail
    } finally {
      setToggling(false);
      setShowConfirmModal(false);
      setConfirmInput("");
    }
  };

  const handleCancel = () => {
    setShowConfirmModal(false);
    setConfirmInput("");
  };

  const consentSummary = safety?.consentSummary ?? { granted: 0, revoked: 0, pending: 0, unknown: 0, total: 0 };

  return (
    <DashboardShell
      isArmed={killSwitchArmed}
      isIsolated={true}
      safetyBlocks={consentSummary.revoked}
    >
      <div className="min-h-screen bg-[#0A0E14] p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-[#3B82F6]" />
            <div>
              <h1 className="text-2xl font-bold text-white">Safety & Policy Monitor</h1>
              <p className="text-sm text-slate-400">Real-time safety decision tracking and policy enforcement</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">ALLOW</span>
                <ShieldCheck className="h-5 w-5" style={{ color: "#10B981" }} />
              </div>
              <div className="mt-3 text-3xl font-bold" style={{ color: "#10B981" }}>
                {dashboardLoading ? "..." : consentSummary.granted}
              </div>
            </div>

            <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">ESCALATE</span>
                <ShieldAlert className="h-5 w-5" style={{ color: "#F59E0B" }} />
              </div>
              <div className="mt-3 text-3xl font-bold" style={{ color: "#F59E0B" }}>
                {dashboardLoading ? "..." : consentSummary.unknown}
              </div>
            </div>

            <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">BLOCK</span>
                <ShieldOff className="h-5 w-5" style={{ color: "#EF4444" }} />
              </div>
              <div className="mt-3 text-3xl font-bold" style={{ color: "#EF4444" }}>
                {dashboardLoading ? "..." : consentSummary.revoked}
              </div>
            </div>
          </div>

          {/* Blocked Reasons - from opt-out keywords */}
          <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Blocked Reasons</h2>
            <div className="space-y-3">
              {optOutKeywords.length === 0 ? (
                <p className="text-sm text-slate-500">No blocked reasons configured</p>
              ) : (
                optOutKeywords.map((kw) => (
                  <div key={kw.id} className="flex items-center gap-3 rounded-lg border border-[#1E293B] bg-[#0A0E14] p-4">
                    <XCircle className="h-5 w-5 shrink-0" style={{ color: "#EF4444" }} />
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-medium text-white">{kw.keyword}</span>
                        <span className="rounded-full bg-[#EF4444]/10 px-2 py-0.5 text-xs font-medium text-[#EF4444]">
                          {kw.channel}
                        </span>
                        {!kw.is_active && (
                          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400">
                            inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Policy Version */}
          <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#3B82F6]" />
              <span className="text-sm font-medium text-slate-400">Policy Version:</span>
              <span className="font-mono text-sm font-semibold text-white">v2.3.1</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Last updated: 2026-09-15</p>
          </div>

          {/* Kill Switch Section */}
          <div
            className={cn(
              "rounded-xl border bg-[#141A25] p-6",
              killSwitchArmed ? "border-[#EF4444]" : "border-[#1E293B]"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield
                  className="h-6 w-6"
                  style={{ color: killSwitchArmed ? "#EF4444" : "#3B82F6" }}
                />
                <div>
                  <h2 className="text-lg font-semibold text-white">Global Kill Switch</h2>
                  <p className="text-sm text-slate-400">When activated, stops ALL automated customer communication</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {killSwitchArmed && (
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "#EF4444" }}></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: "#EF4444" }}></span>
                  </span>
                )}
                <span
                  className="text-2xl font-bold"
                  style={{ color: killSwitchArmed ? "#EF4444" : "#10B981" }}
                >
                  {killSwitchArmed ? "ARMED" : "DISARMED"}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleKillSwitchClick}
                disabled={toggling}
                className="w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#EF4444" }}
              >
                {toggling ? "Updating..." : killSwitchArmed ? "DEACTIVATE KILL SWITCH" : "ACTIVATE KILL SWITCH"}
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-500">Restricted to Project Owner (Adeel)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md rounded-xl border border-[#1E293B] bg-[#141A25] p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6" style={{ color: "#F59E0B" }} />
              <h3 className="text-lg font-semibold text-white">Confirm Kill Switch Change</h3>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              {killSwitchArmed
                ? "This will DEACTIVATE the global kill switch, allowing automated communications to resume."
                : "This will ARM the global kill switch, stopping ALL automated customer communication."}
            </p>

            <div className="mt-4">
              <label htmlFor="confirm-input" className="mb-2 block text-sm font-medium text-slate-300">
                Type DISABLE to confirm
              </label>
              <input
                id="confirm-input"
                type="text"
                placeholder="Type DISABLE"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                className="w-full rounded-lg border border-[#1E293B] bg-[#0A0E14] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-[#3B82F6]"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 rounded-lg border border-[#1E293B] bg-[#0A0E14] px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-[#1E293B]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmInput !== "DISABLE" || toggling}
                className={cn(
                  "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors",
                  confirmInput === "DISABLE"
                    ? "bg-[#EF4444] hover:bg-[#DC2626]"
                    : "cursor-not-allowed bg-[#1E293B] text-slate-600"
                )}
              >
                {toggling ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
