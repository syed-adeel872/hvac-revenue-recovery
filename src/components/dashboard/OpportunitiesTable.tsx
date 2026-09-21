"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin-auth";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  totalEstimateValue: number;
  totalRecovered: number;
  pendingActions: number;
  estimateCount: number;
}

type SafetyDecision = "ALLOW" | "BLOCK" | "ESCALATE";

function SafetyBadge({ decision }: { decision: SafetyDecision }) {
  const s: Record<SafetyDecision, string> = {
    ALLOW: "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/20",
    BLOCK: "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/20",
    ESCALATE: "bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/20",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", s[decision])}>
      {decision === "ALLOW" && <CheckCircle2 className="h-3 w-3" />}
      {decision === "BLOCK" && <XCircle className="h-3 w-3" />}
      {decision === "ESCALATE" && <AlertCircle className="h-3 w-3" />}
      {decision}
    </span>
  );
}

export default function OpportunitiesTable() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/v1/admin/customers?pageSize=8")
      .then((r) => r.json())
      .then((data) => {
        setCustomers(data.customers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="lg:col-span-2 rounded-xl border border-[#1E293B] bg-[#141A25] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1E293B]">
        <h2 className="text-sm font-semibold text-white tracking-[-0.01em]">Opportunities</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E293B]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Customer</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Estimates</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Value</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Recovered</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B]/50">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">Loading...</td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">No customers found</td>
              </tr>
            ) : (
              customers.map((c) => {
                const initials = `${c.firstName?.[0] || ""}${c.lastName?.[0] || ""}`.toUpperCase();
                return (
                  <tr key={c.id} className="hover:bg-[#1E293B]/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-400">{initials || "?"}</span>
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-white">{c.firstName} {c.lastName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[13px] font-mono text-slate-300">{c.estimateCount}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[13px] font-semibold text-white font-mono">${(c.totalEstimateValue || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-[12px] font-mono text-[#10B981]">${(c.totalRecovered || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("text-[12px] font-mono", c.pendingActions > 0 ? "text-[#F59E0B]" : "text-slate-500")}>{c.pendingActions}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
