"use client";

import React, { createContext, useContext } from "react";
import { useDashboardData, type DashboardData } from "@/lib/hooks/useDashboardData";

const DashboardContext = createContext<DashboardData | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const data = useDashboardData();
  return (
    <DashboardContext.Provider value={data}>
      {children}
    </DashboardContext.Provider>
  );
}
