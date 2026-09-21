"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface DashboardShellProps {
  children: React.ReactNode;
  isArmed?: boolean;
  isIsolated?: boolean;
  safetyBlocks?: number;
  opportunities?: number;
}

export default function DashboardShell({
  children,
  isArmed = true,
  isIsolated = true,
  safetyBlocks,
  opportunities,
}: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0E14]">
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        safetyBlocks={safetyBlocks}
        opportunities={opportunities}
      />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-[68px]" : "ml-[260px]"}`}>
        <Topbar isArmed={isArmed} isIsolated={isIsolated} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
