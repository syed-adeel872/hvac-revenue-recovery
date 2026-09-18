"use client";

import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  children?: React.ReactNode;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variants = {
      default: "bg-slate-800 text-slate-300",
      secondary: "bg-slate-700 text-slate-200",
      destructive: "bg-red-900/30 text-red-400 border border-red-800",
      outline: "border border-slate-700 bg-transparent",
      success: "bg-emerald-900/30 text-emerald-400 border border-emerald-800",
      warning: "bg-amber-900/30 text-amber-400 border border-amber-800",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge };