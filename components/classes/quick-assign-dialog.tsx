"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Save, Trash2, Bookmark, CalendarDays, Layers, Ban, RotateCcw } from "lucide-react";
import type { MockBookableClass } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import type { PairPreset } from "@/lib/services/pair-preset-store";
import type { ResolvedEntry } from "@/lib/domain/conflict-utils";
import { BLOCKED_SENTINEL } from "@/lib/constants/teacher-assignment";
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

type AssignScope = "override" | "default";

interface QuickAssignDialogProps {
  entry: ResolvedEntry;
  instance: MockBookableClass;
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  pairPresets: PairPreset[];
  onClose: () => void;
}

export function QuickAssignDialog({
  entry,
  instance,
  teacherRoster,
  teacherNameMap,
  pairPresets,
  onClose,
}: QuickAssignDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activeRoster = teacherRoster.filter((t) => t.isActive);
  const activeTeacherIds = useMemo(() => new Set(activeRoster.map((t) => t.id)), [activeRoster]);
  const [teacher1Id, setTeacher1Id] = useState<string>(entry.teacher1Id ?? "");
  const [teacher2Id, setTeacher2Id] = useState<string>(entry.teacher2Id ?? "");
  const [scope, setScope] = useState<AssignScope>(
    entry.source === "override" || entry.source === "one-off" || entry.source === "blocked" ? "override" : "default"
  );
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [presetLabel, setPresetLabel] = useState("");

  const hasInstanceAssignment = entry.source === "override" || entry.source === "one-off" || entry.source === "blocked";
  const hasClassId = !!entry.classId;
  const defaultSummary = entry.hasDefaultAssignment
    ? `${entry.defaultTeacher1Name ?? "?"}${entry.defaultTeacher2Name ? ` & ${entry.defaultTeacher2Name}` : ""}`
    : null;

  const validPresets = useMemo(
    () =>
      pairPresets.filter(
        (p) =>
          activeTeacherIds.has(p.teacher1Id) &&
          (p.teacher2Id === null || activeTeacherIds.has(p.teacher2Id))
      ),
    [pairPresets, activeTeacherIds]
  );

  const hasTeachersNow = entry.source !== "unassigned" && entry.source !== "blocked";
  const canClearForDate = hasTeachersNow;
  const canRestoreRegular = hasInstanceAssignment && entry.hasDefaultAssignment;

  function applyPreset(presetId: string) {
    const preset = pairPresets.find((p) => p.id === presetId);
    if (preset) {
      setTeacher1Id(preset.teacher1Id);
      setTeacher2Id(preset.teacher2Id ?? "");
    }
  }

  async function maybeSavePreset() {
    if (saveAsPreset && presetLabel.trim()) {
      const { createPairPresetAction } = await import("@/lib/actions/pair-presets");
      const fd = new FormData();
      fd.set("label", presetLabel.trim());
      fd.set("teacher1Id", teacher1Id);
      if (teacher2Id) fd.set("teacher2Id", teacher2Id);
      await createPairPresetAction(fd);
    }
  }

  function handleSave() {
    if (!teacher1Id) {
      setError("Teacher 1 is required");
      return;
    }
    setError(null);

    if (scope === "override") {
      startTransition(async () => {
        const { setInstanceTeacherOverrideAction } = await import("@/lib/actions/classes");
        const res = await setInstanceTeacherOverrideAction(instance.id, teacher1Id, teacher2Id || null);
        if (!res.success) { setError(res.error ?? "Failed to save override"); return; }
        await maybeSavePreset();
        router.refresh();
        onClose();
      });
    } else {
      if (!entry.classId) {
        setError("This instance has no linked class template — cannot save as default");
        return;
      }
      startTransition(async () => {
        const { saveDefaultAssignmentAction } = await import("@/lib/actions/classes");
        const res = await saveDefaultAssignmentAction(entry.classId!, entry.classTitle, teacher1Id, teacher2Id || null);
        if (!res.success) { setError(res.error ?? "Failed to save default assignment"); return; }
        await maybeSavePreset();
        router.refresh();
        onClose();
      });
    }
  }

  /** Clear teachers for this specific date by writing the blocked sentinel. */
  function handleClearForDate() {
    setError(null);
    startTransition(async () => {
      const { setInstanceTeacherOverrideAction } = await import("@/lib/actions/classes");
      const res = await setInstanceTeacherOverrideAction(instance.id, BLOCKED_SENTINEL, null);
      if (!res.success) { setError(res.error ?? "Failed to clear for this date"); return; }
      router.refresh();
      onClose();
    });
  }

  /** Remove the instance-level override entirely so the regular/default comes through. */
  function handleRestoreRegular() {
    setError(null);
    startTransition(async () => {
      const { setInstanceTeacherOverrideAction } = await import("@/lib/actions/classes");
      const res = await setInstanceTeacherOverrideAction(instance.id, null, null);
      if (!res.success) { setError(res.error ?? "Failed to restore regular teachers"); return; }
      router.refresh();
      onClose();
    });
  }

  function handleAddTeacher(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const { createTeacherAction } = await import("@/lib/actions/classes");
      const res = await createTeacherAction(fd);
      if (!res.success) { setError(res.error ?? "Failed to add teacher"); return; }
      router.refresh();
      setShowAddTeacher(false);
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Teachers</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            {/* Instance info + current source */}
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-sm font-medium text-gray-800">{entry.classTitle}</p>
              <p className="text-xs text-gray-500">
                {formatDate(entry.date)} · {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                {entry.location && <span> · {entry.location}</span>}
              </p>

              <div className="mt-2 space-y-1">
                {/* Effective teachers line */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Current:</span>
                  <Badge
                    variant={entry.source === "override" ? "info" : entry.source === "one-off" ? "info" : entry.source === "default" ? "success" : entry.source === "blocked" ? "neutral" : "danger"}
                    className="text-[10px]"
                  >
                    {entry.source === "override" ? "This date only" : entry.source === "one-off" ? "This date only" : entry.source === "default" ? "Regular" : entry.source === "blocked" ? "No teacher assigned" : "No regular teacher set"}
                  </Badge>
                  {entry.teacher1Name ? (
                    <span className="text-xs text-gray-700">
                      {entry.teacher1Name}{entry.teacher2Name ? ` & ${entry.teacher2Name}` : ""}
                    </span>
                  ) : (
                    <span className="text-xs italic text-gray-400">None</span>
                  )}
                </div>

                {/* Default assignment line (always shown for context) */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Regular teachers:</span>
                  {defaultSummary ? (
                    <span className="text-xs text-gray-600">{defaultSummary}</span>
                  ) : (
                    <span className="text-xs italic text-gray-400">Not set</span>
                  )}
                </div>

                {/* Instance-level assignment line */}
                {hasInstanceAssignment && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {entry.source === "blocked" ? "This date:" : "This date:"}
                    </span>
                    {entry.source === "blocked" ? (
                      <span className="text-xs text-gray-500 italic">No teacher assigned for this date</span>
                    ) : (
                      <span className="text-xs text-blue-700">
                        {entry.teacher1Name}{entry.teacher2Name ? ` & ${entry.teacher2Name}` : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Scope selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Where should this be saved?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("override")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    scope === "override"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium leading-tight">This date only</p>
                    <p className="text-[10px] leading-tight text-gray-500">Only affects this date</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => hasClassId && setScope("default")}
                  disabled={!hasClassId}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    scope === "default"
                      ? "border-green-300 bg-green-50 text-green-800"
                      : hasClassId
                        ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                        : "cursor-not-allowed border-gray-100 text-gray-300"
                  }`}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium leading-tight">Regular teachers</p>
                    <p className="text-[10px] leading-tight text-gray-500">
                      {hasClassId ? "Applies to all dates" : "No linked class"}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Pair preset quick-select — only presets whose teachers are all active */}
            {validPresets.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600">Quick Preset</label>
                <select
                  onChange={(e) => e.target.value && applyPreset(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  defaultValue=""
                >
                  <option value="">Select a pair preset…</option>
                  {validPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Teacher selects */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600">Teacher 1 *</label>
                <select
                  value={teacher1Id}
                  onChange={(e) => setTeacher1Id(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— None —</option>
                  {activeRoster.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Teacher 2</label>
                <select
                  value={teacher2Id}
                  onChange={(e) => setTeacher2Id(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— None —</option>
                  {activeRoster.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Save as preset */}
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={saveAsPreset}
                onChange={(e) => setSaveAsPreset(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600"
              />
              <Bookmark className="h-3 w-3" /> Save as pair preset
            </label>
            {saveAsPreset && (
              <input
                type="text"
                value={presetLabel}
                onChange={(e) => setPresetLabel(e.target.value)}
                placeholder="Preset label, e.g. 'María & Carlos'"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            )}

            {/* Add teacher shortcut */}
            {showAddTeacher ? (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3">
                <p className="mb-2 text-xs font-medium text-indigo-700">New Teacher</p>
                <form onSubmit={handleAddTeacher} className="space-y-2">
                  <input
                    name="fullName"
                    required
                    placeholder="Full Name *"
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      name="email"
                      type="email"
                      placeholder="Email"
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <input
                      name="phone"
                      placeholder="Phone"
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <input type="hidden" name="isActive" value="true" />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isPending}>Save Teacher</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddTeacher(false)}>Cancel</Button>
                  </div>
                </form>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddTeacher(true)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add new teacher
              </button>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-wrap items-center gap-2">
            {/* Clear for this date — shown when the instance currently has teachers */}
            {canClearForDate && (
              <Button variant="ghost" size="sm" onClick={handleClearForDate} disabled={isPending}>
                <Ban className="mr-1.5 h-3.5 w-3.5" />
                Clear for this date
              </Button>
            )}
            {/* Restore regular — shown when there is an instance-level state AND default teachers exist underneath */}
            {canRestoreRegular && (
              <Button variant="ghost" size="sm" onClick={handleRestoreRegular} disabled={isPending}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Restore regular
              </Button>
            )}
            {/* Remove for this date — shown for one-off/override without default underneath */}
            {hasInstanceAssignment && !entry.hasDefaultAssignment && entry.source !== "blocked" && (
              <Button variant="ghost" size="sm" onClick={handleRestoreRegular} disabled={isPending}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove for this date
              </Button>
            )}
          </div>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !teacher1Id}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {scope === "override" ? "Save for this date" : "Save as regular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
