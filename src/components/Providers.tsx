"use client";

import { DashboardProvider } from "@/components/dashboard/DashboardContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}
