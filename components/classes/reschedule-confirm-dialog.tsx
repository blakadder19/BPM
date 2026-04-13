"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, MoveRight, Clock, Users, BookOpen, ListOrdered } from "lucide-react";
import type { MockBookableClass, MockTeacherPair } from "@/lib/mock-data";
import { detectConflicts } from "@/lib/domain/conflict-utils";
import { resolveEntries } from "./teacher-calendar";
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

interface RescheduleConfirmDialogProps {
  instance: MockBookableClass;
  newDate: string;
  instances: MockBookableClass[];
  teacherAssignments: MockTeacherPair[];
  teacherNameMap: Record<string, string>;
  onConfirm: () => void;
  onEdit: () => void;
  onClose: () => void;
}

export function RescheduleConfirmDialog({
  instance,
  newDate,
  instances,
  teacherAssignments,
  teacherNameMap,
  onConfirm,
  onEdit,
  onClose,
}: RescheduleConfirmDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const warnings = useMemo(() => {
    const w: { icon: typeof AlertTriangle; text: string; severity: "warning" | "danger" }[] = [];

    if (instance.bookedCount > 0) {
      w.push({ icon: BookOpen, text: `${instance.bookedCount} booking${instance.bookedCount !== 1 ? "s" : ""} attached`, severity: "warning" });
    }
    if (instance.waitlistCount > 0) {
      w.push({ icon: ListOrdered, text: `${instance.waitlistCount} on waitlist`, severity: "warning" });
    }
    if (instance.status === "cancelled") {
      w.push({ icon: AlertTriangle, text: "This instance is cancelled", severity: "danger" });
    }
    if (instance.status === "closed") {
      w.push({ icon: AlertTriangle, text: "This instance is closed", severity: "warning" });
    }

    const hypothetical: MockBookableClass = { ...instance, date: newDate };
    const sameDayInstances = instances.filter((bc) => bc.date === newDate && bc.id !== instance.id && bc.status !== "cancelled");
    const testInstances = [hypothetical, ...sameDayInstances];
    const entries = resolveEntries(testInstances, teacherAssignments, teacherNameMap);
    const conflicts = detectConflicts(entries, teacherNameMap);
    if (conflicts.length > 0) {
      w.push({ icon: Users, text: `Teacher conflict on ${formatDate(newDate)} (${conflicts.length})`, severity: "danger" });
    }

    return w;
  }, [instance, newDate, instances, teacherAssignments, teacherNameMap]);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const { updateInstanceAction } = await import("@/lib/actions/classes");
      const fd = new FormData();
      fd.set("id", instance.id);
      fd.set("date", newDate);
      const res = await updateInstanceAction(fd);
      if (res.success) {
        router.refresh();
        onConfirm();
      } else {
        setError(res.error ?? "Failed to reschedule");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule Class</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-800">{instance.title}</p>
              <div className="mt-2 flex items-center gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-gray-400" />
                  {formatDate(instance.date)}
                </div>
                <MoveRight className="h-4 w-4 text-bpm-500" />
                <div className="flex items-center gap-1.5 font-medium text-bpm-700">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(newDate)}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                <Clock className="mr-1 inline h-3 w-3" />
                {formatTime(instance.startTime)} – {formatTime(instance.endTime)} (time stays the same)
              </p>
            </div>

            {warnings.length > 0 && (
              <div className="space-y-2">
                {warnings.map((w, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                      w.severity === "danger" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <w.icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{w.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={isPending}>
            Open Full Edit
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Moving…" : "Confirm Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
