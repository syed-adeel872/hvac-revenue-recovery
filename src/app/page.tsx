"use client";

import React from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import KPICard from "@/components/dashboard/KPICard";
import RecoveryFunnel from "@/components/dashboard/RecoveryFunnel";
import WorkerTimeline from "@/components/dashboard/WorkerTimeline";
import SafetySummary from "@/components/dashboard/SafetySummary";
import OpportunitiesTable from "@/components/dashboard/OpportunitiesTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { DollarSign, AlertTriangle, TrendingUp, ShieldOff } from "lucide-react";

export default function DashboardPage() {
  const { stats, safety, workflows, loading, error, refresh } = useDashboard();

  const totalActions = (stats?.completedActions ?? 0) + (stats?.pendingActions ?? 0) + (stats?.failedActions ?? 0);
  const estimatedRecoveryPotential = stats ? stats.completedActions * 350 : 0;
  const atRiskCount = stats?.pendingActions ?? 0;
  const safetyBlocks = safety?.consentSummary?.revoked ?? 0;
  const recoveryRate = stats?.recoveryRate ?? 0;

  return (
    <DashboardShell
      isArmed={!safety?.killSwitchActive}
      isIsolated={true}
      safetyBlocks={safetyBlocks}
      opportunities={stats?.pendingActions}
    >
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-[-0.02em]">Command Center</h1>
            <p className="text-sm text-slate-500 mt-1">Real-time revenue recovery overview</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[11px] text-[#10B981] font-medium uppercase tracking-widest">Live</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-sm text-[#F59E0B]">{error}</span>
            </div>
            <button onClick={refresh} className="text-xs font-medium text-[#F59E0B] underline underline-offset-2 hover:text-white transition-colors">
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Est. Recovery"
            value={loading ? <Skeleton className="h-8 w-24" /> : `$${estimatedRecoveryPotential.toLocaleString()}`}
            change={loading ? <Skeleton className="h-4 w-20" /> : `${stats?.completedActions ?? 0} actions completed (est.)`}
            changeType="positive"
            icon={DollarSign}
            color="green"
          />
          <KPICard
            title="At-Risk"
            value={loading ? <Skeleton className="h-8 w-16" /> : String(atRiskCount)}
            change={loading ? <Skeleton className="h-4 w-20" /> : `${stats?.failedActions ?? 0} failed`}
            changeType="negative"
            icon={AlertTriangle}
            color="red"
          />
          <KPICard
            title="Recovery Rate"
            value={loading ? <Skeleton className="h-8 w-20" /> : `${recoveryRate}%`}
            change={loading ? <Skeleton className="h-4 w-24" /> : `${totalActions} total actions`}
            changeType="positive"
            icon={TrendingUp}
            color="blue"
          />
          <KPICard
            title="Safety Blocks"
            value={loading ? <Skeleton className="h-8 w-16" /> : String(safetyBlocks)}
            change={loading ? <Skeleton className="h-4 w-20" /> : `${safety?.outboundSummary?.total ?? 0} messages`}
            changeType="negative"
            icon={ShieldOff}
            color="amber"
          />
        </div>

        {/* Recovery Funnel */}
        <RecoveryFunnel
          stages={workflows?.pipelineStages ?? []}
          unprocessedEvents={workflows?.unprocessedEvents ?? 0}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Opportunities Table */}
          <OpportunitiesTable />

          {/* Right Column: Worker Timeline + Safety Summary */}
          <div className="space-y-4">
            <WorkerTimeline stages={workflows?.pipelineStages ?? []} />
            <SafetySummary safety={safety} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
