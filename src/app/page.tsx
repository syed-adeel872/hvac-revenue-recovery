"use client";

import React from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerTable from "@/components/dashboard/CustomerTable";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: React.ReactNode;
  glowColor: "emerald" | "blue" | "amber" | "purple";
  subtitle?: string;
}

function KPICard({ title, value, change, changeType, icon, glowColor, subtitle }: KPICardProps) {
  const glowClasses = {
    emerald: "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/10",
    blue: "bg-blue-500/10 border-blue-500/20 shadow-blue-500/10",
    amber: "bg-amber-500/10 border-amber-500/20 shadow-amber-500/10",
    purple: "bg-purple-500/10 border-purple-500/20 shadow-purple-500/10",
  };

  const iconBgClasses = {
    emerald: "bg-emerald-500/20 text-emerald-400",
    blue: "bg-blue-500/20 text-blue-400",
    amber: "bg-amber-500/20 text-amber-400",
    purple: "bg-purple-500/20 text-purple-400",
  };

  const changeColorClasses = {
    positive: "text-emerald-400",
    negative: "text-red-400",
    neutral: "text-slate-500",
  };

  const changeIcons = {
    positive: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    ),
    negative: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ),
    neutral: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    ),
  };

  return (
    <div className={cn(
      "relative p-6 rounded-2xl transition-all duration-300 hover:shadow-xl",
      "bg-gradient-to-br from-slate-900/60 to-slate-800/40",
      "border",
      glowClasses[glowColor],
      "shadow-lg",
      "overflow-hidden"
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1 pr-4">
          <div className="flex items-center space-x-2 mb-4">
            <div className={cn("p-3 rounded-xl", iconBgClasses[glowColor])}>
              <div className="h-5 w-5">{icon}</div>
            </div>
            <h3 className="text-sm font-medium text-slate-400 tracking-wide uppercase">{title}</h3>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className="mt-4 flex items-center space-x-2">
            <span className={cn("flex items-center space-x-1 text-sm font-medium", changeColorClasses[changeType])}>
              {changeIcons[changeType]}
              <span>{change}</span>
            </span>
            <span className="text-xs text-slate-500">vs last month</span>
          </div>
        </div>
        <div className="absolute bottom-4 right-4 opacity-0 hover:opacity-100 transition-opacity duration-300">
          <div className={cn("w-32 h-32 rounded-full blur-3xl", glowColor === "emerald" && "bg-emerald-500/20", glowColor === "blue" && "bg-blue-500/20", glowColor === "amber" && "bg-amber-500/20", glowColor === "purple" && "bg-purple-500/20")} />
        </div>
      </div>
    </div>
  );
}

const kpiCards = [
  {
    title: "Total Recovered",
    value: "$128,450",
    change: "+23.5%",
    changeType: "positive" as const,
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0l1 1m-1-1l-1-1m1 1H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    glowColor: "emerald" as const,
    subtitle: "This quarter",
  },
  {
    title: "Unpaid Invoices",
    value: "$34,200",
    change: "-8.2%",
    changeType: "positive" as const,
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    glowColor: "amber" as const,
    subtitle: "Pending recovery",
  },
  {
    title: "AI Recovery Rate",
    value: "73.8%",
    change: "+12.1%",
    changeType: "positive" as const,
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    glowColor: "blue" as const,
    subtitle: "Industry avg: 41%",
  },
  {
    title: "Active Workflows",
    value: "24",
    change: "+5",
    changeType: "positive" as const,
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    glowColor: "purple" as const,
    subtitle: "12 in sequence",
  },
];

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-slate-400 mt-1 text-base lg:text-lg">Monitor and manage your HVAC revenue recovery pipeline</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span>Live</span>
            </span>
            <span className="px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 text-slate-400 text-sm font-mono">Updated 2 min ago</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {kpiCards.map((kpi, index) => (
            <KPICard key={index} {...kpi} />
          ))}
        </div>

        <CustomerTable />
      </div>
    </DashboardLayout>
  );
}