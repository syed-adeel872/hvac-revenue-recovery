"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{
          marginLeft: isSidebarCollapsed ? "5rem" : "18rem", // w-20 = 80px = 5rem, w-72 = 288px = 18rem
        }}
      >
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-900/50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}