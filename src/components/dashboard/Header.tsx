"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

const aiStatuses = [
  { label: "AI Engine Online", variant: "success", pulse: true },
  { label: "Processing Leads", variant: "success", pulse: true },
  { label: "Analyzing Patterns", variant: "success", pulse: true },
  { label: "Optimizing Sequences", variant: "success", pulse: true },
];

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [aiStatusIndex, setAiStatusIndex] = useState(0);
  const [notifications, setNotifications] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setAiStatusIndex((prev) => (prev + 1) % aiStatuses.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const currentStatus = aiStatuses[aiStatusIndex];

  return (
    <header className="h-18 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 sticky top-0 z-30 flex items-center justify-between px-6 lg:px-8">
      <div className="flex-1 max-w-xl">
        <label htmlFor="global-search" className="sr-only">Global search</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <Input
            id="global-search"
            type="search"
            placeholder="Search customers, estimates, workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "bg-slate-900/50 border-slate-800/50 placeholder:text-slate-500",
              "focus:border-emerald-500/50 focus:ring-emerald-500/20",
              "text-sm pl-11 pr-4 h-11 w-full max-w-md",
              "transition-all duration-200"
            )}
          />
        </div>
      </div>

      <div className="flex items-center space-x-4 ml-6 lg:ml-8">
        <div className="hidden sm:flex items-center space-x-3 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800/50">
          <div className={cn(
            "flex items-center space-x-2 text-xs font-medium",
            currentStatus.variant === "success" && "text-emerald-400"
          )}>
            <span className={cn(
              "relative flex h-1.5 w-1.5",
              currentStatus.pulse && "animate-ping"
            )}>
              <span className={cn(
                "absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75",
                currentStatus.pulse && "animate-ping"
              )} />
              <span className={cn(
                "relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500",
                currentStatus.pulse && "animate-pulse"
              )} />
            </span>
            <span className="whitespace-nowrap">{currentStatus.label}</span>
          </div>
        </div>

        <div className="relative">
          <button
            className={cn(
              "relative p-2.5 rounded-xl text-slate-400 hover:text-white",
              "hover:bg-slate-800/50 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            )}
            aria-label="Notifications"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notifications > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                {notifications > 9 ? "9+" : notifications}
              </span>
            )}
          </button>
        </div>

        <div className="relative">
          <button
            className={cn(
              "relative p-2.5 rounded-xl text-slate-400 hover:text-white",
              "hover:bg-slate-800/50 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            )}
            aria-label="Settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <div className="w-px h-6 bg-slate-800/50 mx-1 hidden lg:block" />

        <div className="flex items-center space-x-3 pl-2 lg:pl-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div className="hidden md:block text-left">
            <p className="text-sm font-semibold text-white truncate max-w-[140px]">Adeel Ahmed</p>
            <p className="text-xs text-slate-500">Admin</p>
          </div>
          <button className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors" aria-label="User menu">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}