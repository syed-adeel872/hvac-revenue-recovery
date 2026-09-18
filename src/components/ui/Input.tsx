"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const classNames = cn(
      "flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500",
      "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "placeholder:text-slate-500",
      className
    );
    return (
      <input type={type} className={classNames} ref={ref} {...props} />
    );
  }
);

export { Input };