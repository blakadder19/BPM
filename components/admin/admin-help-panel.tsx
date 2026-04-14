"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, HelpCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminHelp, type AdminHelpEntry, type HelpVisual } from "@/lib/config/admin-help-content";
import { renderHelpVisual } from "./help-visuals";

/* ------------------------------------------------------------------ */
/*  AdminHelpButton — small trigger for page headers                  */
/* ------------------------------------------------------------------ */

export function AdminHelpButton({
  pageKey,
  className,
}: {
  pageKey: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const entry = getAdminHelp(pageKey);

  if (!entry) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Page help"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-700",
          className,
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Help</span>
      </button>
      <HelpSheet entry={entry} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  HelpSheet — slide-in panel (right side, wider)                    */
/* ------------------------------------------------------------------ */

function HelpSheet({
  entry,
  open,
  onClose,
}: {
  entry: AdminHelpEntry;
  open: boolean;
  onClose: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 sm:max-w-[620px]">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 text-bpm-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {entry.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close help"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            {entry.intro}
          </p>

          {entry.sections.map((section) => (
            <HelpSectionBlock key={section.heading} heading={section.heading} items={section.items} visualKey={section.visualKey} />
          ))}

          {entry.visuals && entry.visuals.length > 0 && (
            <div className="space-y-4 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Visual guide
              </p>
              {entry.visuals.map((v) => (
                <HelpVisualBlock key={v.imageSrc} visual={v} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible help section                                          */
/* ------------------------------------------------------------------ */

function HelpSectionBlock({
  heading,
  items,
  visualKey,
}: {
  heading: string;
  items: string[];
  visualKey?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const visual = visualKey ? renderHelpVisual(visualKey) : null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100/60 rounded-lg transition-colors"
      >
        {heading}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-gray-400 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0.5 space-y-4">
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-sm text-gray-600 leading-relaxed"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bpm-400" />
                {item}
              </li>
            ))}
          </ul>
          {visual}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Visual block for optional screenshots / images                    */
/* ------------------------------------------------------------------ */

function HelpVisualBlock({ visual }: { visual: HelpVisual }) {
  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <div className="relative aspect-video bg-gray-50">
        <Image
          src={visual.imageSrc}
          alt={visual.alt}
          fill
          className="object-contain"
          sizes="(max-width: 620px) 100vw, 620px"
        />
      </div>
      <div className="px-3.5 py-2.5 bg-gray-50/60">
        <p className="text-xs font-medium text-gray-700">{visual.title}</p>
        {visual.caption && (
          <p className="text-xs text-gray-500 mt-0.5">{visual.caption}</p>
        )}
      </div>
    </div>
  );
}
