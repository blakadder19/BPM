"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogContextValue {
  onClose: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("Dialog compound components must be used within <Dialog>");
  return ctx;
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, onClose, children }: DialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <DialogContext.Provider value={{ onClose }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-lg mx-4">{children}</div>
      </div>
    </DialogContext.Provider>,
    document.body
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white shadow-xl animate-in fade-in",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { onClose } = useDialog();
  return (
    <div className={cn("flex items-center justify-between border-b border-gray-100 px-6 py-4", className)}>
      <div>{children}</div>
      <button
        onClick={onClose}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("text-lg font-semibold text-gray-900", className)}>
      {children}
    </h2>
  );
}

export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4",
        className
      )}
    >
      {children}
    </div>
  );
}
