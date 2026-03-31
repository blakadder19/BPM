"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, ClipboardCheck, AlertTriangle as AlertTriangleIcon, ExternalLink } from "lucide-react";
import type { MockClass, MockBookableClass } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatTime } from "@/lib/utils";

interface SettingsFlags {
  roleBalancedStyleNames: string[];
  socialsBookable: boolean;
  weeklyEventsBookable: boolean;
  studentPracticeBookable: boolean;
}

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Add Instance Dialog ─────────────────────────────────────

export function AddInstanceDialog({
  templates,
  allStyles,
  allTerms,
  onClose,
  defaultDate,
}: {
  templates: MockClass[];
  allStyles?: { id: string; name: string }[];
  allTerms?: { id: string; name: string; startDate: string; endDate: string }[];
  onClose: () => void;
  defaultDate?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [manualStyleId, setManualStyleId] = useState("");
  const [manualLevel, setManualLevel] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");

  const [enforceTermRules, setEnforceTermRules] = useState(false);

  const tpl = templates.find((t) => t.id === selectedTemplateId);
  const isManual = !tpl;

  const effectiveTermId = selectedTermId || tpl?.termId || "";
  const effectiveEnforce = tpl ? (tpl.termBound ?? false) : enforceTermRules;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (tpl) {
      fd.set("templateId", tpl.id);
      if (!fd.get("title")) fd.set("title", tpl.title);
      if (!fd.get("classType")) fd.set("classType", tpl.classType);
      fd.set("styleName", tpl.styleName ?? "");
      fd.set("styleId", tpl.styleId ?? "");
      fd.set("level", tpl.level ?? "");
      if (effectiveTermId) fd.set("termId", effectiveTermId);
      fd.set("termBound", effectiveEnforce ? "true" : "false");
    } else {
      const chosenStyle = allStyles?.find((s) => s.id === manualStyleId);
      if (chosenStyle) {
        fd.set("styleName", chosenStyle.name);
        fd.set("styleId", chosenStyle.id);
      }
      if (manualLevel) fd.set("level", manualLevel);
      if (selectedTermId) fd.set("termId", selectedTermId);
      fd.set("termBound", selectedTermId && enforceTermRules ? "true" : "false");
    }

    startTransition(async () => {
      const { createInstanceAction } = await import("@/lib/actions/classes");
      const result = await createInstanceAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to create");
    });
  }

  const today = defaultDate ?? new Date().toISOString().slice(0, 10);

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Class Instance</DialogTitle></DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700">From Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">— Manual entry —</option>
                {templates.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>{t.title} ({t.styleName ?? t.classType})</option>
                ))}
              </select>
            </div>

            {allTerms && allTerms.length > 0 && (
              <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">Term Settings</legend>
                {tpl && tpl.termId ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Badge variant="default">From template</Badge>
                    {allTerms.find((t) => t.id === tpl.termId)?.name ?? tpl.termId}
                    {tpl.termBound && <Badge variant="warning">Enforced</Badge>}
                  </div>
                ) : null}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {tpl?.termId ? "Override Term" : "Linked Term"}
                  </label>
                  <select
                    value={effectiveTermId}
                    onChange={(e) => {
                      setSelectedTermId(e.target.value);
                      if (!e.target.value && isManual) setEnforceTermRules(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">— No term —</option>
                    {allTerms.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.startDate} to {t.endDate})</option>
                    ))}
                  </select>
                </div>
                {isManual && effectiveTermId && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enforceTermRules}
                      onChange={(e) => setEnforceTermRules(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    Enforce term late-entry rules
                  </label>
                )}
              </fieldset>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title *</label>
                <input name="title" defaultValue={tpl?.title ?? ""} key={selectedTemplateId} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Class Type *</label>
                <select name="classType" defaultValue={tpl?.classType ?? "class"} key={`ct-${selectedTemplateId}`} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  <option value="class">Class</option>
                  <option value="social">Social</option>
                  <option value="student_practice">Student Practice</option>
                </select>
              </div>
            </div>

            {isManual && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Style</label>
                  {allStyles && allStyles.length > 0 ? (
                    <select
                      value={manualStyleId}
                      onChange={(e) => setManualStyleId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">— None —</option>
                      {allStyles.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 text-xs text-amber-600 italic py-2">No dance styles configured yet.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Level</label>
                  <select
                    value={manualLevel}
                    onChange={(e) => setManualLevel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">— None —</option>
                    <option value="Beginner 1">Beginner 1</option>
                    <option value="Beginner 2">Beginner 2</option>
                    <option value="Improver">Improver</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Open">Open</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Date *</label>
                <input name="date" type="date" defaultValue={today} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Start *</label>
                <input name="startTime" type="time" defaultValue={tpl?.startTime ?? ""} key={`st-${selectedTemplateId}`} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End *</label>
                <input name="endTime" type="time" defaultValue={tpl?.endTime ?? ""} key={`et-${selectedTemplateId}`} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Capacity</label>
                <input name="maxCapacity" type="number" min={0} defaultValue={tpl?.maxCapacity ?? ""} key={`mc-${selectedTemplateId}`} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Leader Cap</label>
                <input name="leaderCap" type="number" min={0} defaultValue={tpl?.leaderCap ?? ""} key={`lc-${selectedTemplateId}`} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Follower Cap</label>
                <input name="followerCap" type="number" min={0} defaultValue={tpl?.followerCap ?? ""} key={`fc-${selectedTemplateId}`} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input name="location" defaultValue={tpl?.location ?? ""} key={`loc-${selectedTemplateId}`} placeholder="e.g. Studio A, Studio B" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select name="status" defaultValue="scheduled" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea name="notes" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create"}</Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Instance Dialog ────────────────────────────────────

export function EditInstanceDialog({
  instance,
  allTerms,
  onClose,
}: {
  instance: MockBookableClass;
  allTerms?: { id: string; name: string; startDate: string; endDate: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState(instance.termId ?? "");
  const [enforceTermRules, setEnforceTermRules] = useState(instance.termBound ?? false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", instance.id);
    fd.set("termId", selectedTermId);
    fd.set("termBound", selectedTermId && enforceTermRules ? "true" : "false");
    startTransition(async () => {
      const { updateInstanceAction } = await import("@/lib/actions/classes");
      const result = await updateInstanceAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to update");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Instance — {instance.title}</DialogTitle></DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title *</label>
                <input name="title" defaultValue={instance.title} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select name="status" defaultValue={instance.status} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {allTerms && allTerms.length > 0 && (
              <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">Term Settings</legend>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Linked Term</label>
                  <select
                    value={selectedTermId}
                    onChange={(e) => {
                      setSelectedTermId(e.target.value);
                      if (!e.target.value) setEnforceTermRules(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">— No term —</option>
                    {allTerms.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.startDate} to {t.endDate})</option>
                    ))}
                  </select>
                </div>
                {selectedTermId && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enforceTermRules}
                      onChange={(e) => setEnforceTermRules(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    Enforce term late-entry rules
                  </label>
                )}
              </fieldset>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Date</label>
                <input name="date" type="date" defaultValue={instance.date} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Start</label>
                <input name="startTime" type="time" defaultValue={instance.startTime} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End</label>
                <input name="endTime" type="time" defaultValue={instance.endTime} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Capacity</label>
                <input name="maxCapacity" type="number" min={0} defaultValue={instance.maxCapacity ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Leader Cap</label>
                <input name="leaderCap" type="number" min={0} defaultValue={instance.leaderCap ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Follower Cap</label>
                <input name="followerCap" type="number" min={0} defaultValue={instance.followerCap ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <input name="location" defaultValue={instance.location} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea name="notes" rows={2} defaultValue={instance.notes ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>

            {instance.classId && (
              <p className="text-xs text-gray-400">Source template and class type are inherited from the template and cannot be changed here.</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Teacher Override Dialog ──────────────────────────────────

export function TeacherOverrideDialog({
  instance,
  teacherRoster,
  teacherNameMap,
  onClose,
}: {
  instance: MockBookableClass;
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [t1, setT1] = useState(instance.teacherOverride1Id ?? "");
  const [t2, setT2] = useState(instance.teacherOverride2Id ?? "");

  const activeTeachers = teacherRoster.filter((t) => t.isActive);
  const hasOverride = !!instance.teacherOverride1Id;

  function handleSave() {
    if (!t1) { setError("Teacher 1 is required for an override"); return; }
    startTransition(async () => {
      const { setInstanceTeacherOverrideAction } = await import("@/lib/actions/classes");
      const result = await setInstanceTeacherOverrideAction(instance.id, t1, t2 || null);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to save override");
    });
  }

  function handleClear() {
    startTransition(async () => {
      const { setInstanceTeacherOverrideAction } = await import("@/lib/actions/classes");
      const result = await setInstanceTeacherOverrideAction(instance.id, null, null);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to clear override");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Date-specific Teachers — {instance.title} ({formatDate(instance.date)})</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <p className="text-sm text-gray-600">
              Set a one-off teacher override for this specific dated instance.
              Clearing the override makes it fall back to the default template assignment.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Teacher 1 *</label>
                <select
                  value={t1}
                  onChange={(e) => setT1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— Select —</option>
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teacher 2</label>
                <select
                  value={t2}
                  onChange={(e) => setT2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— None (solo) —</option>
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                {hasOverride && (
                  <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={isPending}>
                    Clear date-specific
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={handleSave} disabled={isPending}>
                  {isPending ? "Saving…" : "Save for this date"}
                </Button>
              </div>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Schedule Dialog ────────────────────────────────

export function GenerateScheduleDialog({
  activeTemplateCount,
  totalTemplateCount,
  onClose,
}: {
  activeTemplateCount: number;
  totalTemplateCount?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; overwritten: number } | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<{ toCreate: number; toSkip: number; toOverwrite: number } | null>(null);

  const today = new Date();
  const defaultStart = today.toISOString().slice(0, 10);
  const twoWeeks = new Date(today);
  twoWeeks.setDate(twoWeeks.getDate() + 14);
  const defaultEnd = twoWeeks.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  function applyPreset(days: number) {
    const s = new Date();
    const e = new Date();
    e.setDate(e.getDate() + days);
    setStartDate(s.toISOString().slice(0, 10));
    setEndDate(e.toISOString().slice(0, 10));
    setPreview(null);
  }

  function handlePreview() {
    setError(null);
    startTransition(async () => {
      const { previewGenerateScheduleAction } = await import("@/lib/actions/classes");
      const res = await previewGenerateScheduleAction(startDate, endDate, { includeInactive, overwrite });
      if (res.success) setPreview({ toCreate: res.toCreate, toSkip: res.toSkip, toOverwrite: res.toOverwrite });
      else setError(res.error ?? "Preview failed");
    });
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const { generateScheduleAction } = await import("@/lib/actions/classes");
      const res = await generateScheduleAction(startDate, endDate, { includeInactive, overwrite });
      if (res.success) {
        setResult({ created: res.created, skipped: res.skipped, overwritten: res.overwritten ?? 0 });
        router.refresh();
      } else setError(res.error ?? "Failed to generate");
    });
  }

  const templateLabel = includeInactive
    ? `${totalTemplateCount ?? activeTemplateCount} template${(totalTemplateCount ?? activeTemplateCount) !== 1 ? "s" : ""} (including inactive)`
    : `${activeTemplateCount} active template${activeTemplateCount !== 1 ? "s" : ""}`;

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate Schedule</DialogTitle></DialogHeader>
        <DialogBody>
          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                Created {result.created} instance{result.created !== 1 ? "s" : ""}
                {result.skipped > 0 && <>, skipped {result.skipped} duplicate{result.skipped !== 1 ? "s" : ""}</>}
                {result.overwritten > 0 && <>, overwritten {result.overwritten}</>}.
              </div>
              <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
            </div>
          ) : (
            <div className="space-y-4">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

              <p className="text-sm text-gray-600">
                Generate dated class instances from <strong>{templateLabel}</strong> for each matching day-of-week in the date range.
              </p>

              {/* Presets */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Quick:</span>
                <button type="button" onClick={() => applyPreset(7)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">Next 1 week</button>
                <button type="button" onClick={() => applyPreset(30)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">Next 1 month</button>
                <button type="button" onClick={() => applyPreset(14)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">Next 2 weeks</button>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date *</label>
                  <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPreview(null); }} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date *</label>
                  <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPreview(null); }} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={includeInactive} onChange={(e) => { setIncludeInactive(e.target.checked); setPreview(null); }} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                  Include inactive templates
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); setPreview(null); }} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                  Overwrite existing matching instances
                </label>
                {overwrite && (
                  <p className="ml-6 text-xs text-amber-600">
                    Existing instances with matching template/date/time will be replaced. Bookings and attendance data for overwritten instances will be lost.
                  </p>
                )}
              </div>

              {/* Preview */}
              {preview && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm">
                  <p className="font-medium text-indigo-700">Preview</p>
                  <div className="mt-1 space-y-0.5 text-gray-700">
                    <p><strong>{preview.toCreate}</strong> new instance{preview.toCreate !== 1 ? "s" : ""} will be created</p>
                    {preview.toSkip > 0 && <p><strong>{preview.toSkip}</strong> duplicate{preview.toSkip !== 1 ? "s" : ""} will be skipped</p>}
                    {preview.toOverwrite > 0 && <p className="text-amber-700"><strong>{preview.toOverwrite}</strong> existing instance{preview.toOverwrite !== 1 ? "s" : ""} will be overwritten</p>}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                {!preview ? (
                  <Button type="button" onClick={handlePreview} disabled={isPending}>
                    {isPending ? "Previewing…" : "Preview"}
                  </Button>
                ) : (
                  <Button type="button" onClick={handleGenerate} disabled={isPending}>
                    {isPending ? "Generating…" : `Generate ${preview.toCreate + preview.toOverwrite} instance${preview.toCreate + preview.toOverwrite !== 1 ? "s" : ""}`}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Instance Detail Panel ───────────────────────────────────

export function InstanceDetailPanel({
  instance: bc,
  settings,
  resolvedTeacher1,
  resolvedTeacher2,
  isOverride,
  defaultTeacherSummary,
  allTerms,
}: {
  instance: MockBookableClass;
  settings: SettingsFlags;
  resolvedTeacher1: string | null;
  resolvedTeacher2: string | null;
  isOverride: boolean;
  defaultTeacherSummary: string;
  allTerms?: { id: string; name: string; startDate: string; endDate: string }[];
}) {
  const roleBalanced = bc.styleName != null && (settings.roleBalancedStyleNames ?? []).includes(bc.styleName);

  const bookabilityWarning =
    bc.classType === "social" && !settings.socialsBookable
      ? "Socials are not bookable (Settings)"
      : bc.classType === "student_practice" && !settings.studentPracticeBookable
        ? "Student Practice is not bookable (Settings)"
        : null;

  const teacherDisplay = resolvedTeacher1
    ? `${resolvedTeacher1}${resolvedTeacher2 ? ` & ${resolvedTeacher2}` : " (solo)"}`
    : "Unassigned";

  const linkedTerm = bc.termId && allTerms ? allTerms.find((t) => t.id === bc.termId) : null;
  const today = new Date().toISOString().slice(0, 10);
  const isFutureTerm = !!(linkedTerm && today < linkedTerm.startDate);

  let weekNumber: number | null = null;
  if (linkedTerm && !isFutureTerm) {
    const classDate = new Date(bc.date + "T00:00:00");
    const termStart = new Date(linkedTerm.startDate + "T00:00:00");
    const diffMs = classDate.getTime() - termStart.getTime();
    if (diffMs >= 0) weekNumber = Math.min(Math.floor(diffMs / (7 * 86_400_000)) + 1, 4);
  }

  return (
    <tr>
      <td colSpan={10} className="bg-gray-50 px-6 py-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Instance Details</h4>
            <dl className="space-y-1">
              <Detail label="Title" value={bc.title} />
              <Detail label="Source Template" value={bc.classId ?? "Manual"} />
              <Detail label="Type"><StatusBadge status={bc.classType} /></Detail>
              <Detail label="Style" value={bc.styleName ?? "—"} />
              <Detail label="Level" value={bc.level ?? "—"} />
              <Detail label="Date" value={formatDate(bc.date)} />
              <Detail label="Time" value={`${formatTime(bc.startTime)} – ${formatTime(bc.endTime)}`} />
              <Detail label="Location" value={bc.location} />
              <Detail label="Status"><StatusBadge status={bc.status} /></Detail>
              <Detail label="Term">
                {linkedTerm ? (
                  <span className="flex items-center gap-1.5">
                    {bc.termBound ? <Badge variant="warning">Term-enforced</Badge> : <Badge variant="default">Term-linked</Badge>}
                    {linkedTerm.name}
                    {isFutureTerm && <Badge variant="info">Future term</Badge>}
                    {weekNumber && <Badge variant="info">Week {weekNumber}</Badge>}
                  </span>
                ) : bc.termId ? (
                  <span className="text-amber-600">⚠ Linked term not found</span>
                ) : (
                  <span className="text-gray-400">No term linked</span>
                )}
              </Detail>
              {linkedTerm && (
                <Detail label="Term Period" value={`${formatDate(linkedTerm.startDate)} – ${formatDate(linkedTerm.endDate)}`} />
              )}
              {linkedTerm && (
                <Detail label="Enforcement" value={bc.termBound ? "ON — late-entry rules apply" : "OFF — informational only"} />
              )}
            </dl>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Teachers</h4>
              <dl className="space-y-1">
                <Detail label="Current">
                  <span className="flex items-center gap-1.5">
                    {teacherDisplay}
                    {isOverride && <Badge variant="info">Date-specific</Badge>}
                  </span>
                </Detail>
                {isOverride && (
                  <Detail label="Default" value={defaultTeacherSummary || "Unassigned"} />
                )}
              </dl>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Capacity & Bookings</h4>
              <dl className="space-y-1">
                <Detail label="Total Capacity" value={bc.maxCapacity != null ? String(bc.maxCapacity) : "—"} />
                <Detail label="Booked" value={String(bc.bookedCount)} />
                <Detail label="Leaders" value={String(bc.leaderCount)} />
                <Detail label="Followers" value={String(bc.followerCount)} />
                <Detail label="Waitlist" value={String(bc.waitlistCount)} />
                <Detail label="Leader Cap" value={bc.leaderCap != null ? String(bc.leaderCap) : "—"} />
                <Detail label="Follower Cap" value={bc.followerCap != null ? String(bc.followerCap) : "—"} />
                <Detail label="Role Balanced">
                  {roleBalanced ? <Badge variant="info">Role Balanced</Badge> : <span className="text-gray-400">No</span>}
                </Detail>
              </dl>
            </div>

            {bookabilityWarning && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{bookabilityWarning}</div>
            )}

            {bc.notes && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Notes</h4>
                <p className="text-sm text-gray-600">{bc.notes}</p>
              </div>
            )}

            {/* Quick links */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Quick Links</h4>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/bookings?classTitle=${encodeURIComponent(bc.title)}&date=${bc.date}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <BookOpen className="h-3 w-3" /> Bookings
                  <ExternalLink className="h-2.5 w-2.5 text-gray-400" />
                </Link>
                <Link
                  href={`/attendance?classTitle=${encodeURIComponent(bc.title)}&date=${bc.date}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <ClipboardCheck className="h-3 w-3" /> Attendance
                  <ExternalLink className="h-2.5 w-2.5 text-gray-400" />
                </Link>
                <Link
                  href={`/penalties?classTitle=${encodeURIComponent(bc.title)}&date=${bc.date}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <AlertTriangleIcon className="h-3 w-3" /> Penalties
                  <ExternalLink className="h-2.5 w-2.5 text-gray-400" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Detail({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-700">{children ?? value}</dd>
    </div>
  );
}
