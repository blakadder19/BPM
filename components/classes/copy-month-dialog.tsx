"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, AlertTriangle } from "lucide-react";
import type { MockBookableClass } from "@/lib/mock-data";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

function addMonths(ym: string, offset: number): string {
  const [y, m] = ym.split("-").map(Number);
  let nm = m + offset;
  let ny = y;
  while (nm < 1) { nm += 12; ny--; }
  while (nm > 12) { nm -= 12; ny++; }
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function generateMonthOptions(centerYM: string, back = 6, forward = 6) {
  const opts: { value: string; label: string }[] = [];
  for (let i = -back; i <= forward; i++) {
    const ym = addMonths(centerYM, i);
    opts.push({ value: ym, label: monthLabel(ym) });
  }
  return opts;
}

function slotKey(dayOfWeek: number, inst: MockBookableClass): string {
  return inst.classId
    ? `${dayOfWeek}|${inst.classId}|${inst.startTime}`
    : `${dayOfWeek}|${inst.title}|${inst.startTime}|${inst.endTime}`;
}

interface SlotRepresentative {
  dayOfWeek: number;
  classId: string | null;
  title: string;
  classType: MockBookableClass["classType"];
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
  teacherOverride1Id?: string | null;
  teacherOverride2Id?: string | null;
  termBound?: boolean;
  notes?: string | null;
}

interface PreviewItem {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  styleName: string | null;
  level: string | null;
  location: string;
  isDuplicate: boolean;
}

interface CopyMonthDialogProps {
  instances: MockBookableClass[];
  existingKeys: Set<string>;
  onClose: () => void;
}

export function CopyMonthDialog({
  instances,
  existingKeys,
  onClose,
}: CopyMonthDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const todayYM = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [sourceYM, setSourceYM] = useState(todayYM);
  const [targetYM, setTargetYM] = useState(() => addMonths(todayYM, 1));
  const [copyTeachers, setCopyTeachers] = useState(true);
  const [copyNotes, setCopyNotes] = useState(false);
  const [initialStatus, setInitialStatus] = useState<"scheduled" | "open">(
    "scheduled"
  );
  const [showPreview, setShowPreview] = useState(false);

  const monthOptions = useMemo(
    () => generateMonthOptions(todayYM, 6, 12),
    [todayYM]
  );

  const sourceRange = useMemo(() => monthRange(sourceYM), [sourceYM]);
  const targetRange = useMemo(() => monthRange(targetYM), [targetYM]);

  const sourceInstances = useMemo(
    () =>
      instances.filter(
        (bc) => bc.date >= sourceRange.start && bc.date <= sourceRange.end
      ),
    [instances, sourceRange]
  );

  const slots = useMemo(() => {
    const map = new Map<string, { rep: SlotRepresentative; latestDate: string }>();

    for (const bc of sourceInstances) {
      const dow = new Date(bc.date + "T12:00:00").getDay();
      const key = slotKey(dow, bc);
      const existing = map.get(key);

      if (!existing || bc.date > existing.latestDate) {
        map.set(key, {
          latestDate: bc.date,
          rep: {
            dayOfWeek: dow,
            classId: bc.classId,
            title: bc.title,
            classType: bc.classType,
            styleName: bc.styleName,
            styleId: bc.styleId,
            level: bc.level,
            startTime: bc.startTime,
            endTime: bc.endTime,
            maxCapacity: bc.maxCapacity,
            leaderCap: bc.leaderCap,
            followerCap: bc.followerCap,
            location: bc.location,
            teacherOverride1Id: bc.teacherOverride1Id,
            teacherOverride2Id: bc.teacherOverride2Id,
            termBound: bc.termBound,
            notes: bc.notes,
          },
        });
      }
    }

    return Array.from(map.values()).map((v) => v.rep);
  }, [sourceInstances]);

  const previewItems = useMemo(() => {
    if (!showPreview || slots.length === 0) return [];

    const items: PreviewItem[] = [];
    const start = new Date(targetRange.start + "T12:00:00");
    const end = new Date(targetRange.end + "T12:00:00");

    for (
      const d = new Date(start);
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const dow = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);

      for (const slot of slots) {
        if (slot.dayOfWeek !== dow) continue;

        const dupKey = slot.classId
          ? `${slot.classId}|${dateStr}|${slot.startTime}`
          : `__adhoc__|${dateStr}|${slot.startTime}`;

        items.push({
          title: slot.title,
          date: dateStr,
          startTime: slot.startTime,
          endTime: slot.endTime,
          styleName: slot.styleName,
          level: slot.level,
          location: slot.location,
          isDuplicate: existingKeys.has(dupKey),
        });
      }
    }

    return items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
    );
  }, [showPreview, slots, targetRange, existingKeys]);

  const newItems = previewItems.filter((p) => !p.isDuplicate);
  const duplicateCount = previewItems.length - newItems.length;
  const sameMonth = sourceYM === targetYM;

  const canPreview = slots.length > 0 && !sameMonth;
  const canCreate = showPreview && newItems.length > 0 && !sameMonth;

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const { copyMonthScheduleAction } = await import(
        "@/lib/actions/classes"
      );
      const res = await copyMonthScheduleAction(sourceYM, targetYM, {
        copyTeachers,
        copyNotes,
        status: initialStatus,
      });
      if (res.success) {
        setResult({
          created: res.created,
          skipped: res.skipped,
          failed: res.failed,
        });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to copy schedule");
        if (res.created > 0) router.refresh();
      }
    });
  }

  const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const slotsByDay = useMemo(() => {
    const groups = new Map<number, SlotRepresentative[]>();
    for (const s of slots) {
      const arr = groups.get(s.dayOfWeek) ?? [];
      arr.push(s);
      groups.set(s.dayOfWeek, arr);
    }
    return groups;
  }, [slots]);

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy Previous Month&apos;s Schedule
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                Created <strong>{result.created}</strong> instance
                {result.created !== 1 ? "s" : ""} in{" "}
                <strong>{monthLabel(targetYM)}</strong>
                {result.skipped > 0 && (
                  <>
                    , skipped {result.skipped} duplicate
                    {result.skipped !== 1 ? "s" : ""}
                  </>
                )}
                {result.failed > 0 && (
                  <>
                    ,{" "}
                    <span className="text-red-600">
                      {result.failed} failed
                    </span>
                  </>
                )}
                .
              </div>
              <div className="flex justify-end">
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* ── Source & Target ─────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Copy from (source)
                  </label>
                  <select
                    value={sourceYM}
                    onChange={(e) => {
                      setSourceYM(e.target.value);
                      setShowPreview(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                  >
                    {monthOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Copy to (target)
                  </label>
                  <select
                    value={targetYM}
                    onChange={(e) => {
                      setTargetYM(e.target.value);
                      setShowPreview(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                  >
                    {monthOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {sameMonth && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Source and target months must be different.
                </div>
              )}

              {/* ── Source summary ──────────────────────── */}
              <fieldset className="rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">
                  Source: {monthLabel(sourceYM)}
                </legend>
                {sourceInstances.length === 0 ? (
                  <p className="py-1 text-sm text-gray-400 italic">
                    No class instances found in {monthLabel(sourceYM)}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      <strong>{sourceInstances.length}</strong> instance
                      {sourceInstances.length !== 1 ? "s" : ""} found
                      &nbsp;→&nbsp;
                      <strong>{slots.length}</strong> unique weekly slot
                      {slots.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                        const daySlots = slotsByDay.get(dow);
                        if (!daySlots) return null;
                        return (
                          <span key={dow}>
                            <strong>{DAY_SHORT[dow]}</strong>: {daySlots.length}{" "}
                            slot{daySlots.length !== 1 ? "s" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </fieldset>

              {/* ── Options ────────────────────────────── */}
              <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">
                  Options
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={copyTeachers}
                    onChange={(e) => setCopyTeachers(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600"
                  />
                  Copy teacher overrides
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={copyNotes}
                    onChange={(e) => setCopyNotes(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600"
                  />
                  Copy notes
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700">
                    Status for new instances:
                  </span>
                  <select
                    value={initialStatus}
                    onChange={(e) =>
                      setInitialStatus(e.target.value as "scheduled" | "open")
                    }
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="open">Open</option>
                  </select>
                </div>
              </fieldset>

              {/* ── What gets copied ───────────────────── */}
              <div className="rounded-lg bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
                <strong>Copied:</strong> title, type, style, level, time,
                location, capacity
                {copyTeachers ? ", teacher overrides" : ""}
                {copyNotes ? ", notes" : ""}.
                <br />
                <strong>Reset:</strong> status → {initialStatus}, bookings → 0,
                waitlist → 0. Term auto-assigned if date falls within one.
              </div>

              {/* ── Preview / Actions ──────────────────── */}
              {!showPreview ? (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => setShowPreview(true)}
                    disabled={!canPreview}
                  >
                    Preview
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700">
                        {newItems.length} instance
                        {newItems.length !== 1 ? "s" : ""} to create in{" "}
                        {monthLabel(targetYM)}
                      </span>
                      {duplicateCount > 0 && (
                        <Badge variant="warning">
                          {duplicateCount} duplicate
                          {duplicateCount !== 1 ? "s" : ""} skipped
                        </Badge>
                      )}
                    </div>

                    {previewItems.length > 0 && (
                      <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Date
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Title
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Time
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Style / Level
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {previewItems.map((item, idx) => (
                              <tr
                                key={`${item.date}-${item.startTime}-${idx}`}
                                className={
                                  item.isDuplicate
                                    ? "bg-amber-50/50 text-gray-400 line-through"
                                    : ""
                                }
                              >
                                <td className="whitespace-nowrap px-3 py-1.5">
                                  {item.date}
                                </td>
                                <td className="px-3 py-1.5">{item.title}</td>
                                <td className="whitespace-nowrap px-3 py-1.5">
                                  {item.startTime}–{item.endTime}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-gray-500">
                                  {[item.styleName, item.level]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </td>
                                <td className="px-3 py-1.5">
                                  {item.isDuplicate ? (
                                    <span className="text-xs text-amber-600">
                                      Exists
                                    </span>
                                  ) : (
                                    <span className="text-xs text-green-600">
                                      New
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {newItems.length === 0 && previewItems.length > 0 && (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        All instances already exist in{" "}
                        {monthLabel(targetYM)}. Nothing new to create.
                      </div>
                    )}
                    {previewItems.length === 0 && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        No instances to generate. The source month may have no
                        matching weekly slots.
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(false)}
                    >
                      ← Back
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={!canCreate || isPending}
                    >
                      {isPending
                        ? "Copying…"
                        : `Create ${newItems.length} Instance${newItems.length !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
