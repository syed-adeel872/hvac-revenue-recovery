"use client";

import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/admin-auth";

export interface StatsData {
  customers: number;
  leads: number;
  estimates: number;
  pendingActions: number;
  completedActions: number;
  failedActions: number;
  recoveryRate: number;
  activeWorkflows: number;
  bookings: number;
  unresolvedErrors: number;
  lastUpdated: string;
}

export interface ConsentSummary {
  granted: number;
  revoked: number;
  pending: number;
  unknown: number;
  total: number;
}

export interface SafetyData {
  consents: Array<{
    id: string;
    customer_id: string;
    type: string;
    status: string;
    source: string;
    granted_at: string | null;
    revoked_at: string | null;
    expires_at: string | null;
  }>;
  consentSummary: ConsentSummary;
  optOutKeywords: Array<{
    id: string;
    keyword: string;
    channel: string;
    is_active: boolean;
    created_at: string;
  }>;
  killSwitchActive: boolean;
  optedOutCustomerIds: string[];
  outboundSummary: {
    delivered: number;
    failed: number;
    pending: number;
    total: number;
  };
}

export interface PipelineStage {
  name: string;
  workerType: string;
  pending: number;
  completed: number;
  failed: number;
  total: number;
  health: "idle" | "healthy" | "degraded";
}

export interface WorkflowsData {
  pipelineStages: PipelineStage[];
  unprocessedEvents: number;
  failedEvents: number;
  circuitBreakers: Array<{
    client_id: string;
    state: string;
    failure_count: number;
    last_failure_time: string;
  }>;
  globalKillSwitchActive: boolean;
  lastUpdated: string;
}

export interface TenantData {
  currentTenant: {
    id: string;
    name: string;
    display_name: string | null;
    status: string;
    created_at: string;
    kill_switch_enabled: boolean;
  } | null;
  members: Array<{
    id: string;
    user_id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
  }>;
  tableIsolation: Array<{
    name: string;
    count: number;
    isolated: boolean;
  }>;
  totalTables: number;
  allIsolated: boolean;
}

export interface DashboardData {
  stats: StatsData | null;
  safety: SafetyData | null;
  workflows: WorkflowsData | null;
  tenants: TenantData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboardData(): DashboardData {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [safety, setSafety] = useState<SafetyData | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowsData | null>(null);
  const [tenants, setTenants] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsRes, safetyRes, workflowsRes, tenantsRes] = await Promise.allSettled([
        adminFetch("/api/v1/admin/stats").then((r) => {
          if (!r.ok) throw new Error(`Stats: ${r.status}`);
          return r.json();
        }),
        adminFetch("/api/v1/admin/safety").then((r) => {
          if (!r.ok) throw new Error(`Safety: ${r.status}`);
          return r.json();
        }),
        adminFetch("/api/v1/admin/workflows").then((r) => {
          if (!r.ok) throw new Error(`Workflows: ${r.status}`);
          return r.json();
        }),
        adminFetch("/api/v1/admin/tenants").then((r) => {
          if (!r.ok) throw new Error(`Tenants: ${r.status}`);
          return r.json();
        }),
      ]);

      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (safetyRes.status === "fulfilled") setSafety(safetyRes.value);
      if (workflowsRes.status === "fulfilled") setWorkflows(workflowsRes.value);
      if (tenantsRes.status === "fulfilled") setTenants(tenantsRes.value);

      const errors: string[] = [];
      if (statsRes.status === "rejected") errors.push(statsRes.reason?.message || "Stats failed");
      if (safetyRes.status === "rejected") errors.push(safetyRes.reason?.message || "Safety failed");
      if (workflowsRes.status === "rejected") errors.push(workflowsRes.reason?.message || "Workflows failed");
      if (tenantsRes.status === "rejected") errors.push(tenantsRes.reason?.message || "Tenants failed");

      if (errors.length > 0 && errors.length < 4) {
        setError(`Partial load: ${errors.join(", ")}`);
      } else if (errors.length === 4) {
        setError("Failed to load dashboard data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    stats,
    safety,
    workflows,
    tenants,
    loading,
    error,
    refresh: fetchData,
  };
}
