"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MockClass } from "@/lib/mock-data";
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
import { dayName, formatTime, formatDate } from "@/lib/utils";
import { isTermBoundLevel } from "@/lib/domain/term-rules";

const CLASS_TYPES = [
  { value: "class", label: "Class" },
  { value: "social", label: "Social" },
  { value: "student_practice", label: "Student Practice" },
];

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

interface StyleOption {
  id: string;
  name: string;
}

interface SettingsFlags {
  roleBalancedStyleNames: string[];
  socialsBookable: boolean;
  weeklyEventsBookable: boolean;
  studentPracticeBookable: boolean;
}

// ── Shared form ─────────────────────────────────────────────

interface TermOption {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
}

function TemplateForm({
  initial,
  allStyles,
  allTerms,
  onSubmit,
  isPending,
  error,
}: {
  initial: Partial<MockClass>;
  allStyles: StyleOption[];
  allTerms?: TermOption[];
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [classType, setClassType] = useState(initial.classType ?? "class");
  const [styleId, setStyleId] = useState(initial.styleId ?? "");
  const [selectedTermId, setSelectedTermId] = useState(initial.termId ?? "");
  const [isTermBound, setIsTermBound] = useState(initial.termBound ?? false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (initial.id) fd.set("id", initial.id);
    const style = allStyles.find((s) => s.id === fd.get("styleId"));
    fd.set("styleName", style?.name ?? "");
    onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Title *</label>
        <input
          name="title"
          defaultValue={initial.title ?? ""}
          required
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Class Type *</label>
          <select
            name="classType"
            value={classType}
            onChange={(e) => setClassType(e.target.value as MockClass["classType"])}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
          >
            {CLASS_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Style</label>
          {allStyles.length > 0 ? (
            <select
              name="styleId"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
            >
              <option value="">— None —</option>
              {allStyles.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-xs text-amber-600 italic py-2">No dance styles configured yet. Add styles in your database.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Level</label>
          <select
            name="level"
            defaultValue={initial.level ?? ""}
            onChange={(e) => {
              const lv = e.target.value || null;
              if (isTermBoundLevel(lv) && !isTermBound) setIsTermBound(true);
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
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
        <div>
          <label className="block text-sm font-medium text-gray-700">Day of Week *</label>
          <select
            name="dayOfWeek"
            defaultValue={initial.dayOfWeek === 0 ? 7 : (initial.dayOfWeek ?? 1)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
          >
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Time *</label>
          <input name="startTime" type="time" defaultValue={initial.startTime ?? ""} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">End Time *</label>
          <input name="endTime" type="time" defaultValue={initial.endTime ?? ""} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Total Capacity</label>
          <input name="maxCapacity" type="number" min={0} defaultValue={initial.maxCapacity ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Leader Cap</label>
          <input name="leaderCap" type="number" min={0} defaultValue={initial.leaderCap ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Follower Cap</label>
          <input name="followerCap" type="number" min={0} defaultValue={initial.followerCap ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Location</label>
        <input name="location" defaultValue={initial.location ?? ""} placeholder="e.g. Studio A, Studio B" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100" />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <input type="hidden" name="isActive" value={initial.isActive !== false ? "true" : "false"} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              defaultChecked={initial.isActive !== false}
              onChange={(e) => {
                const hidden = e.target.form?.querySelector('input[name="isActive"][type="hidden"]') as HTMLInputElement | null;
                if (hidden) hidden.value = e.target.checked ? "true" : "false";
              }}
              className="h-4 w-4 rounded border-gray-300 text-bpm-600"
            />
            Active
          </label>
        </div>
      </div>

      {allTerms && allTerms.length > 0 && (
        <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-xs font-semibold text-gray-500">Term Settings</legend>
          <div>
            <label className="block text-sm font-medium text-gray-700">Linked Term</label>
            <select
              name="termId"
              value={selectedTermId}
              onChange={(e) => {
                setSelectedTermId(e.target.value);
                if (!e.target.value) setIsTermBound(false);
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
            >
              <option value="">— No term —</option>
              {allTerms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.startDate && t.endDate ? ` (${t.startDate} to ${t.endDate})` : ""}
                </option>
              ))}
            </select>
          </div>
          {selectedTermId && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isTermBound}
                onChange={(e) => setIsTermBound(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-bpm-600"
              />
              Enforce term late-entry rules
            </label>
          )}
          <input type="hidden" name="termBound" value={selectedTermId && isTermBound ? "true" : "false"} />
        </fieldset>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

// ── Add dialog ──────────────────────────────────────────────

export function AddTemplateDialog({
  allStyles,
  allTerms,
  onClose,
}: {
  allStyles: StyleOption[];
  allTerms?: TermOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const { createTemplateAction } = await import("@/lib/actions/classes");
      const result = await createTemplateAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to create");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Template</DialogTitle></DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <TemplateForm initial={{}} allStyles={allStyles} allTerms={allTerms} onSubmit={handleSubmit} isPending={isPending} error={error} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ─────────────────────────────────────────────

export function EditTemplateDialog({
  template,
  allStyles,
  allTerms,
  onClose,
}: {
  template: MockClass;
  allStyles: StyleOption[];
  allTerms?: TermOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const { updateTemplateAction } = await import("@/lib/actions/classes");
      const result = await updateTemplateAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to update");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Template</DialogTitle></DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <TemplateForm initial={template} allStyles={allStyles} allTerms={allTerms} onSubmit={handleSubmit} isPending={isPending} error={error} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail panel (inline expanded row) ──────────────────────

export function TemplateDetailPanel({
  template: c,
  settings,
  assignments,
  allTerms,
}: {
  template: MockClass;
  settings: SettingsFlags;
  assignments: { teacher1Name: string; teacher2Name: string | null; effectiveFrom: string }[];
  allTerms?: TermOption[];
}) {
  const roleBalanced = c.styleName != null && (settings.roleBalancedStyleNames ?? []).includes(c.styleName);
  const linkedTerm = c.termId && allTerms ? allTerms.find((t) => t.id === c.termId) : null;

  const bookabilityWarning =
    c.classType === "social" && !settings.socialsBookable
      ? "Socials are not bookable (Settings)"
      : c.classType === "student_practice" && !settings.studentPracticeBookable
        ? "Student Practice is not bookable (Settings)"
        : null;

  return (
    <tr>
      <td colSpan={10} className="bg-gray-50 px-6 py-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">General</h4>
            <dl className="space-y-1">
              <Detail label="Title" value={c.title} />
              <Detail label="Type"><StatusBadge status={c.classType} /></Detail>
              <Detail label="Style" value={c.styleName ?? "—"} />
              <Detail label="Level" value={c.level ?? "—"} />
              <Detail label="Day" value={dayName(c.dayOfWeek)} />
              <Detail label="Time" value={`${formatTime(c.startTime)} – ${formatTime(c.endTime)}`} />
              <Detail label="Location" value={c.location} />
              <Detail label="Active" value={c.isActive ? "Yes" : "No"} />
              <Detail label="Term">
                {linkedTerm ? (
                  <span className="flex items-center gap-1.5">
                    {c.termBound ? <Badge variant="warning">Term-enforced</Badge> : <Badge variant="default">Term-linked</Badge>}
                    {linkedTerm.name}
                  </span>
                ) : c.termId ? (
                  <span className="text-amber-600">⚠ Linked term not found</span>
                ) : (
                  <span className="text-gray-400">No term linked</span>
                )}
              </Detail>
              {linkedTerm && linkedTerm.startDate && linkedTerm.endDate && (
                <Detail label="Term Period" value={`${formatDate(linkedTerm.startDate)} – ${formatDate(linkedTerm.endDate)}`} />
              )}
              {linkedTerm && (
                <Detail label="Enforcement" value={c.termBound ? "ON — late-entry rules apply" : "OFF — informational only"} />
              )}
            </dl>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Capacity & Balance</h4>
              <dl className="space-y-1">
                <Detail label="Total Capacity" value={c.maxCapacity != null ? String(c.maxCapacity) : "—"} />
                <Detail label="Leader Cap" value={c.leaderCap != null ? String(c.leaderCap) : "—"} />
                <Detail label="Follower Cap" value={c.followerCap != null ? String(c.followerCap) : "—"} />
                <Detail label="Role Balanced">
                  {roleBalanced ? <Badge variant="info">Role Balanced</Badge> : <span className="text-gray-400">No</span>}
                </Detail>
              </dl>
            </div>

            {bookabilityWarning && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{bookabilityWarning}</div>
            )}

            {c.notes && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Notes</h4>
                <p className="text-sm text-gray-600">{c.notes}</p>
              </div>
            )}

            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Default Teachers</h4>
              {assignments.length > 0 ? (
                <ul className="space-y-1 text-sm text-gray-600">
                  {assignments.map((a, i) => (
                    <li key={i}>
                      {a.teacher1Name}
                      {a.teacher2Name ? ` & ${a.teacher2Name}` : " (solo)"}
                      <span className="ml-1 text-xs text-gray-400">from {a.effectiveFrom}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No default assignment</p>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Detail({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-700">{children ?? value}</dd>
    </div>
  );
}
