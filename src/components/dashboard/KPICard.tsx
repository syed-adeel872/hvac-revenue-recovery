"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: React.ReactNode;
  change: React.ReactNode;
  changeType: "positive" | "negative" | "neutral";
  icon: React.ElementType;
  color: "blue" | "green" | "amber" | "red";
}

export default function KPICard({ title, value, change, changeType, icon: Icon, color }: KPICardProps) {
  const cm = {
    blue: { bg: "bg-[#3B82F6]/10", icon: "text-[#3B82F6]" },
    green: { bg: "bg-[#10B981]/10", icon: "text-[#10B981]" },
    amber: { bg: "bg-[#F59E0B]/10", icon: "text-[#F59E0B]" },
    red: { bg: "bg-[#EF4444]/10", icon: "text-[#EF4444]" },
  }[color];

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#141A25] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", cm.bg)}>
          <Icon className={cn("h-5 w-5", cm.icon)} />
        </div>
        <span className={cn(
          "text-[11px] font-medium px-2 py-0.5 rounded-full",
          changeType === "positive" && "text-[#10B981] bg-[#10B981]/10",
          changeType === "negative" && "text-[#EF4444] bg-[#EF4444]/10",
          changeType === "neutral" && "text-slate-400 bg-[#1E293B]"
        )}>
          {change}
        </span>
      </div>
      <div className="text-2xl font-bold text-white tracking-[-0.02em]">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1 uppercase tracking-widest font-medium">{title}</div>
    </div>
  );
}
