"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Shield, Building2, Bell, Search } from "lucide-react";

interface TopbarProps {
  isArmed?: boolean;
  isIsolated?: boolean;
}

export default function Topbar({ isArmed = true, isIsolated = true }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[#1E293B] bg-[#0A0E14]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: Search */}
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search customers, estimates, actions..."
              className="w-full h-9 rounded-lg bg-[#141A25] border border-[#1E293B] pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#3B82F6] focus:border-[#3B82F6] transition-all"
            />
          </div>
        </div>

        {/* Right: Status badges */}
        <div className="flex items-center gap-3">
          {/* Tenant Isolation Badge */}
          <div className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest",
            isIsolated
              ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20"
              : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
          )}>
            <Building2 className="h-3.5 w-3.5" />
            {isIsolated ? "ISOLATED" : "NOT ISOLATED"}
          </div>

          {/* Kill Switch ARMED Badge */}
          <div className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest",
            isArmed
              ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20"
              : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
          )}>
            <Shield className="h-3.5 w-3.5" />
            {isArmed ? "ARMED" : "KILLED"}
          </div>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#141A25] transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#EF4444]" />
          </button>

          {/* User */}
          <div className="flex items-center gap-2 pl-3 border-l border-[#1E293B]">
            <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/20 flex items-center justify-center">
              <span className="text-xs font-bold text-[#3B82F6]">A</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-medium text-white">Adeel</div>
              <div className="text-[10px] text-slate-500">Owner</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
