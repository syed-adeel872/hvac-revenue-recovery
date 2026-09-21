"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import {
  LayoutDashboard,
  Target,
  GitBranch,
  Shield,
  ScrollText,
  Plug,
  Building2,
  Zap,
} from "lucide-react";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  safetyBlocks?: number;
  opportunities?: number;
}

interface WorkerHealthItem {
  k: string;
  v: string;
  status: "ok" | "degraded" | "idle";
}

function deriveWorkerHealth(workers: WorkerHealthItem[]): WorkerHealthItem[] {
  return workers;
}

export default function Sidebar({ isCollapsed, onToggle, safetyBlocks, opportunities }: SidebarProps) {
  const pathname = usePathname();
  const { workflows } = useDashboard();

  const pipelineStages = workflows?.pipelineStages ?? [];

  const workerHealth: WorkerHealthItem[] = [
    {
      k: "Intelligence",
      v: pipelineStages.find((s) => s.workerType === "intelligence")?.health === "degraded" ? "WARN" : "OK",
      status: pipelineStages.find((s) => s.workerType === "intelligence")?.health === "degraded" ? "degraded" : "ok",
    },
    {
      k: "Recovery",
      v: pipelineStages.find((s) => s.workerType === "recovery")?.health === "degraded" ? "WARN" : "OK",
      status: pipelineStages.find((s) => s.workerType === "recovery")?.health === "degraded" ? "degraded" : "ok",
    },
    {
      k: "Safety",
      v: pipelineStages.find((s) => s.workerType === "safety")?.health === "degraded" ? "WARN" : "OK",
      status: pipelineStages.find((s) => s.workerType === "safety")?.health === "degraded" ? "degraded" : "ok",
    },
    {
      k: "Ops",
      v: pipelineStages.length === 0 ? "IDLE" : "OK",
      status: pipelineStages.length === 0 ? "idle" : "ok",
    },
  ];

  const navigation = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard, badge: null },
    { label: "Opportunities", href: "/opportunities", icon: Target, badge: opportunities != null ? String(opportunities) : null },
    { label: "Recovery Pipeline", href: "/recovery-pipeline", icon: GitBranch, badge: null },
    { label: "Safety", href: "/safety", icon: Shield, badge: safetyBlocks != null ? String(safetyBlocks) : null },
    { label: "Operations", href: "/operations", icon: ScrollText, badge: null },
    { label: "Integrations", href: "/integrations", icon: Plug, badge: null },
    { label: "Tenants & Settings", href: "/tenants", icon: Building2, badge: null },
  ];

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen flex flex-col transition-all duration-300",
        "bg-[#0A0E14] border-r border-[#1E293B]",
        isCollapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className={cn("h-16 flex items-center border-b border-[#1E293B] px-4", isCollapsed && "justify-center")}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3B82F6] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white tracking-[-0.01em]">HVAC Recovery</div>
              <div className="text-[10px] text-slate-500">Revenue Intelligence</div>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-[#3B82F6] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn("p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#141A25] transition-colors", isCollapsed ? "ml-auto" : "ml-auto")}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={isCollapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
                isActive
                  ? "bg-[#141A25] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(59,130,246,0.2)]"
                  : "text-slate-400 hover:bg-[#141A25]/60 hover:text-slate-200",
                isCollapsed && "justify-center"
              )}
              aria-current={isActive ? "page" : undefined}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-[#3B82F6]" : "text-slate-500 group-hover:text-slate-300")} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left tracking-[-0.01em]">{item.label}</span>
                  {item.badge && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      item.label.includes("Safety")
                        ? "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/20"
                        : "bg-[#1E293B] text-slate-300"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Worker Health */}
      {!isCollapsed && (
        <div className="border-t border-[#1E293B] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2 px-1">Worker Health</div>
          <div className="grid grid-cols-2 gap-2">
            {workerHealth.map((w) => (
              <div key={w.k} className="flex items-center gap-2 rounded-lg bg-[#141A25] px-2.5 py-2 border border-[#1E293B]">
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  w.status === "degraded" ? "bg-[#F59E0B] animate-pulse" :
                  w.status === "idle" ? "bg-slate-600" :
                  "bg-[#10B981]"
                )} />
                <span className="text-[11px] text-slate-300">{w.k}</span>
                <span className={cn(
                  "ml-auto text-[10px] font-semibold",
                  w.status === "degraded" ? "text-[#F59E0B]" :
                  w.status === "idle" ? "text-slate-500" :
                  "text-[#10B981]"
                )}>{w.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
