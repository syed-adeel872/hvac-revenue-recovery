"use client";

import { forwardRef } from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  type DialogProps,
} from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps extends DialogProps {
  className?: string;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ className, children, open, onOpenChange, ...props }, ref) => {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogContent
            ref={ref}
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:max-w-lg",
              className
            )}
            {...props}
          >
            <DialogClose asChild>
              <button className="absolute right-4 top-4 rounded-lg opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:pointer-events-none text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-1.5">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </DialogClose>
            {children}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    );
  }
);

Modal.displayName = "Modal";

export { Modal };