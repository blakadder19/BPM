"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Trash2, Pencil } from "lucide-react";
import type { MockBookableClass } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import type { PairPreset } from "@/lib/services/pair-preset-store";
import type { TeacherConflict, ResolvedEntry } from "@/lib/domain/conflict-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/utils";

function sourceLabel(s: ResolvedEntry["source"]): string {
  return s === "override" ? "This date only" : s === "one-off" ? "This date only" : s === "default" ? "Regular" : s === "blocked" ? "No teacher assigned" : "No regular teacher set";
}

function sourceBadgeVariant(s: ResolvedEntry["source"]): "info" | "success" | "danger" | "neutral" {
  return s === "override" ? "info" : s === "one-off" ? "info" : s === "default" ? "success" : s === "blocked" ? "neutral" : "danger";
}

interface ConflictDetailDialogProps {
  conflicts: TeacherConflict[];
  allEntries: ResolvedEntry[];
  instances: MockBookableClass[];
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  pairPresets: PairPreset[];
  onOpenAssign: (entry: ResolvedEntry) => void;
  onClose: () => void;
}

export function ConflictDetailDialog({
  conflicts,
  allEntries,
  instances,
  teacherRoster,
  teacherNameMap,
  pairPresets,
  onOpenAssign,
  onClose,
}: ConflictDetailDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const entryMap = new Map<string, ResolvedEntry>();
  for (const e of allEntries) entryMap.set(e.instanceId, e);

  function handleUnassign(instanceId: string) {
    startTransition(async () => {
      const { setInstanceTeacherOverrideAction } = await import("@/lib/actions/classes");
      await setInstanceTeacherOverrideAction(instanceId, null, null);
      router.refresh();
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {conflicts.length} Scheduling Conflict{conflicts.length !== 1 ? "s" : ""}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[60vh] overflow-y-auto">
          <div className="space-y-5">
            {conflicts.map((conflict, ci) => (
              <div key={`${conflict.teacherId}-${conflict.date}-${ci}`} className="rounded-lg border border-red-100 bg-red-50/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="danger" className="text-xs">Conflict</Badge>
                  <span className="text-sm font-medium text-gray-800">{conflict.teacherName}</span>
                  <span className="text-xs text-gray-500">on {formatDate(conflict.date)}</span>
                </div>

                <div className="space-y-2">
                  {conflict.instances.map((inst, ii) => {
                    const entry = entryMap.get(inst.id);
                    if (!entry) return null;

                    const teacherText = entry.teacher1Name
                      ? `${entry.teacher1Name}${entry.teacher2Name ? ` & ${entry.teacher2Name}` : ""}`
                      : "No teacher assigned";

                    return (
                      <div
                        key={inst.id}
                        className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800">{inst.title}</p>
                            <Badge variant={sourceBadgeVariant(entry.source)} className="text-[10px]">
                              {sourceLabel(entry.source)}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatTime(inst.startTime)} – {formatTime(inst.endTime)}
                            {entry.location && <span> · {entry.location}</span>}
                          </p>
                          <p className="text-xs text-gray-600">{teacherText}</p>
                        </div>
                        <div className="ml-3 flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => onOpenAssign(entry)}
                            className="rounded p-1.5 text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                            title="Edit assignment"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {(entry.source === "override" || entry.source === "one-off" || entry.source === "blocked") && (
                            <button
                              onClick={() => handleUnassign(inst.id)}
                              disabled={isPending}
                              className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove teacher for this date"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {conflict.instances.length === 2 && (
                  <p className="mt-2 text-xs text-red-600">
                    <strong>{conflict.teacherName}</strong> is assigned to both classes at overlapping times on this date.
                  </p>
                )}
                {conflict.instances.length > 2 && (
                  <p className="mt-2 text-xs text-red-600">
                    <strong>{conflict.teacherName}</strong> is assigned to {conflict.instances.length} overlapping classes on this date.
                  </p>
                )}
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
