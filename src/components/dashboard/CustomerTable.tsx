"use client";

import React, { useState, useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: "active" | "active-sequence" | "recovered" | "dormant" | "at-risk";
  estimateValue: number;
  recoveredAmount: number;
  lastContact: string;
  sequenceStage: string;
  tags: string[];
}

const mockCustomers: Customer[] = [
  {
    id: "cust-001",
    name: "Robert Chen",
    company: "Apex Heating & Cooling",
    email: "robert.chen@apexhvac.com",
    phone: "(555) 234-1890",
    status: "active-sequence",
    estimateValue: 28500,
    recoveredAmount: 12000,
    lastContact: "2 hours ago",
    sequenceStage: "Follow-up #3 - SMS sent",
    tags: ["High Value", "Responsive"],
  },
  {
    id: "cust-002",
    name: "Maria Santos",
    company: "Metro Climate Solutions",
    email: "maria@metroclimate.io",
    phone: "(555) 412-9876",
    status: "recovered",
    estimateValue: 45000,
    recoveredAmount: 45000,
    lastContact: "3 days ago",
    sequenceStage: "Closed - Booked",
    tags: ["Closed Won", "Referral"],
  },
  {
    id: "cust-003",
    name: "James Mitchell",
    company: "Comfort Masters HVAC",
    email: "j.mitchell@comfortmasters.net",
    phone: "(555) 678-3421",
    status: "active",
    estimateValue: 18750,
    recoveredAmount: 0,
    lastContact: "5 hours ago",
    sequenceStage: "Initial outreach - Email sent",
    tags: ["New Lead", "Estimate Sent"],
  },
  {
    id: "cust-004",
    name: "Sarah Williams",
    company: "Premier Air Systems",
    email: "sarah.w@premierair.com",
    phone: "(555) 901-5678",
    status: "at-risk",
    estimateValue: 32000,
    recoveredAmount: 8500,
    lastContact: "1 week ago",
    sequenceStage: "Follow-up #2 - No response",
    tags: ["Stalled", "Needs Attention"],
  },
  {
    id: "cust-005",
    name: "David Park",
    company: "Elite Thermal Services",
    email: "dpark@elitethermal.com",
    phone: "(555) 345-0987",
    status: "active-sequence",
    estimateValue: 55000,
    recoveredAmount: 22000,
    lastContact: "30 mins ago",
    sequenceStage: "Call scheduled - Tomorrow 10AM",
    tags: ["Enterprise", "High Priority"],
  },
  {
    id: "cust-006",
    name: "Lisa Thompson",
    company: "Apex Heating & Cooling",
    email: "l.thompson@apexhvac.com",
    phone: "(555) 234-1891",
    status: "recovered",
    estimateValue: 15600,
    recoveredAmount: 15600,
    lastContact: "1 day ago",
    sequenceStage: "Closed - Booked",
    tags: ["Closed Won", "Repeat Customer"],
  },
  {
    id: "cust-007",
    name: "Michael Rodriguez",
    company: "Metro Climate Solutions",
    email: "mrodriguez@metroclimate.io",
    phone: "(555) 412-9877",
    status: "dormant",
    estimateValue: 22000,
    recoveredAmount: 0,
    lastContact: "45 days ago",
    sequenceStage: "No engagement - Archived",
    tags: ["Cold Lead", "Re-engage"],
  },
  {
    id: "cust-008",
    name: "Jennifer Kim",
    company: "Comfort Masters HVAC",
    email: "jkim@comfortmasters.net",
    phone: "(555) 678-3422",
    status: "active",
    estimateValue: 41000,
    recoveredAmount: 0,
    lastContact: "1 hour ago",
    sequenceStage: "Proposal delivered - Awaiting reply",
    tags: ["Hot Lead", "Decision Maker"],
  },
  {
    id: "cust-009",
    name: "Thomas Anderson",
    company: "Premier Air Systems",
    email: "t.anderson@premierair.com",
    phone: "(555) 901-5679",
    status: "active-sequence",
    estimateValue: 19500,
    recoveredAmount: 5000,
    lastContact: "4 hours ago",
    sequenceStage: "Follow-up #1 - Email opened",
    tags: ["Engaged", "Price Sensitive"],
  },
  {
    id: "cust-010",
    name: "Amanda Foster",
    company: "Elite Thermal Services",
    email: "afoster@elitethermal.com",
    phone: "(555) 345-0988",
    status: "at-risk",
    estimateValue: 38000,
    recoveredAmount: 12000,
    lastContact: "2 weeks ago",
    sequenceStage: "Follow-up #4 - Final attempt",
    tags: ["At Risk", "Escalation Needed"],
  },
  {
    id: "cust-011",
    name: "Christopher Lee",
    company: "Apex Heating & Cooling",
    email: "clee@apexhvac.com",
    phone: "(555) 234-1892",
    status: "recovered",
    estimateValue: 62000,
    recoveredAmount: 62000,
    lastContact: "6 hours ago",
    sequenceStage: "Closed - Booked",
    tags: ["Closed Won", "Enterprise", "Largest Deal"],
  },
  {
    id: "cust-012",
    name: "Nicole Brown",
    company: "Metro Climate Solutions",
    email: "nbrown@metroclimate.io",
    phone: "(555) 412-9878",
    status: "active",
    estimateValue: 27500,
    recoveredAmount: 0,
    lastContact: "2 hours ago",
    sequenceStage: "New estimate generated",
    tags: ["New Lead", "Urgent"],
  },
];

const statusConfig = {
  "active-sequence": { label: "Active Sequence", color: "emerald", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "recovered": { label: "Recovered", color: "emerald", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "active": { label: "Active", color: "blue", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  "at-risk": { label: "At Risk", color: "amber", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  "dormant": { label: "Dormant", color: "slate", bg: "bg-slate-500/10", border: "border-slate-500/20" },
};

const filterTabs = [
  { id: "all", label: "All", count: mockCustomers.length },
  { id: "active-sequence", label: "Active Sequence", count: mockCustomers.filter(c => c.status === "active-sequence").length },
  { id: "recovered", label: "Recovered", count: mockCustomers.filter(c => c.status === "recovered").length },
  { id: "active", label: "Active", count: mockCustomers.filter(c => c.status === "active").length },
  { id: "at-risk", label: "At Risk", count: mockCustomers.filter(c => c.status === "at-risk").length },
];

export default function CustomerTable() {
  const [activeFilter, setActiveFilter] = useState<"all" | "active-sequence" | "recovered" | "active" | "at-risk">("all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: "asc" | "desc" }>({ key: "lastContact", direction: "desc" });
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const filteredCustomers = useMemo(() => {
    let result = activeFilter === "all" ? mockCustomers : mockCustomers.filter(c => c.status === activeFilter);
    
    result = [...result].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [activeFilter, sortConfig]);

  const handleSort = (key: keyof Customer) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllSelection = () => {
    if (selectedRows.length === filteredCustomers.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredCustomers.map(c => c.id));
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };

  const getStatusBadge = (status: Customer["status"]) => {
    const config = statusConfig[status];
    return (
      <Badge variant="outline" className={cn(config.bg, config.border, "text-" + config.color + "-400", "font-medium", "px-3", "py-1", "text-xs")}>
        {config.label}
      </Badge>
    );
  };

  const SortIcon = ({ field }: { field: keyof Customer }) => {
    if (sortConfig.key !== field) return (
      <svg className="h-4 w-4 text-slate-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 16l4-4 4 4m-2-12v12" />
      </svg>
    );
    return sortConfig.direction === "asc" ? (
      <svg className="h-4 w-4 text-emerald-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="h-4 w-4 text-emerald-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Customers</h2>
            <p className="text-sm text-slate-400 mt-0.5">Manage and track revenue recovery opportunities</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </Button>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Customer
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Customer filters">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeFilter === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveFilter(tab.id as typeof activeFilter)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                activeFilter === tab.id
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
                  : "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/50"
              )}
            >
              {tab.label}
              <span className={cn("ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-mono", activeFilter === tab.id ? "bg-emerald-500/30 text-emerald-300" : "bg-slate-700/50 text-slate-500")}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-950/50 border-b border-slate-800/50">
              <TableHead className="w-12 p-4">
                <input
                  type="checkbox"
                  checked={selectedRows.length === filteredCustomers.length && filteredCustomers.length > 0}
                  onChange={toggleAllSelection}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                  aria-label="Select all rows"
                />
              </TableHead>
              {[
                { key: "name", label: "Customer" },
                { key: "company", label: "Company" },
                { key: "estimateValue", label: "Estimate Value" },
                { key: "recoveredAmount", label: "Recovered" },
                { key: "status", label: "Status" },
                { key: "sequenceStage", label: "Sequence Stage" },
                { key: "lastContact", label: "Last Contact" },
              ].map((col) => (
                <TableHead
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort(col.key as keyof Customer)}
                >
                  <div className="flex items-center space-x-1">
                    {col.label}
                    <SortIcon field={col.key as keyof Customer} />
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-32 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-800/50">
            {filteredCustomers.map((customer) => {
              const isSelected = selectedRows.includes(customer.id);
              return (
                <TableRow
                  key={customer.id}
                  className={cn(
                    "transition-colors",
                    isSelected && "bg-emerald-500/5 border-l-4 border-l-emerald-500"
                  )}
                >
                  <TableCell className="p-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelection(customer.id)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      aria-label={`Select ${customer.name}`}
                    />
                  </TableCell>
                  <TableCell className="p-4">
                    <div>
                      <p className="font-medium text-white truncate max-w-[200px]">{customer.name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{customer.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="p-4">
                    <p className="text-sm text-white font-medium">{customer.company}</p>
                    <p className="text-xs text-slate-500">{customer.phone}</p>
                  </TableCell>
                  <TableCell className="p-4">
                    <p className="text-sm font-semibold text-white tabular-nums">{formatCurrency(customer.estimateValue)}</p>
                  </TableCell>
                  <TableCell className="p-4">
                    <p className="text-sm font-semibold text-emerald-400 tabular-nums">{formatCurrency(customer.recoveredAmount)}</p>
                    {customer.estimateValue > 0 && customer.recoveredAmount > 0 && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {Math.round((customer.recoveredAmount / customer.estimateValue) * 100)}% recovered
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="p-4">{getStatusBadge(customer.status)}</TableCell>
                  <TableCell className="p-4">
                    <div className="flex items-center space-x-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        customer.status === "active-sequence" && "bg-emerald-400 animate-pulse",
                        customer.status === "recovered" && "bg-emerald-500",
                        customer.status === "active" && "bg-blue-400",
                        customer.status === "at-risk" && "bg-amber-400",
                        customer.status === "dormant" && "bg-slate-500"
                      )} />
                      <p className="text-sm text-slate-300 truncate max-w-[180px]">{customer.sequenceStage}</p>
                    </div>
                  </TableCell>
                  <TableCell className="p-4">
                    <p className="text-sm text-slate-300">{customer.lastContact}</p>
                  </TableCell>
                  <TableCell className="p-4">
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 h-8 w-8"
                        aria-label={`View details for ${customer.name}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 h-8 w-8"
                        aria-label={`Message ${customer.name}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 h-8 w-8"
                        aria-label={`Edit ${customer.name}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredCustomers.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center space-y-3">
                    <svg className="h-12 w-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-slate-400">No customers found</p>
                    <p className="text-xs text-slate-500">Try adjusting your filters</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="p-4 border-t border-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4 text-sm text-slate-400">
          <span>{selectedRows.length} of {filteredCustomers.length} selected</span>
          {selectedRows.length > 0 && (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                Bulk Message
              </Button>
              <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
                Add to Sequence
              </Button>
              <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                Export Selected
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" disabled className="w-8 h-8 p-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
          <span className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm font-mono text-slate-300">Page 1 of 3</span>
          <Button variant="outline" size="sm" className="w-8 h-8 p-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}