"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MockClass, MockTeacherPair } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import { TEACHER_CATEGORY_LABELS } from "@/lib/services/teacher-roster-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CATEGORY_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "core_instructor", label: "Core Instructor" },
  { value: "instructor", label: "Instructor" },
  { value: "assistant", label: "Assistant" },
  { value: "yoga", label: "Yoga" },
];

// ── Teacher Roster dialogs ──────────────────────────────────

function TeacherForm({
  initial,
  onSubmit,
  isPending,
  error,
}: {
  initial: Partial<Teacher>;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  error: string | null;
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (initial.id) fd.set("id", initial.id);
    onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Full Name *</label>
        <input
          name="fullName"
          defaultValue={initial.fullName ?? ""}
          required
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={initial.email ?? ""}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            defaultValue={initial.phone ?? ""}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Role / Category</label>
        <select
          name="category"
          defaultValue={initial.category ?? ""}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={initial.notes ?? ""}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="hidden"
          name="isActive"
          value={initial.isActive !== false ? "true" : "false"}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={initial.isActive !== false}
            onChange={(e) => {
              const hidden = e.target.form?.querySelector(
                'input[name="isActive"][type="hidden"]'
              ) as HTMLInputElement | null;
              if (hidden) hidden.value = e.target.checked ? "true" : "false";
            }}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          Active
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function AddTeacherDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const { createTeacherAction } = await import("@/lib/actions/classes");
      const result = await createTeacherAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to create");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Teacher</DialogTitle></DialogHeader>
        <DialogBody>
          <TeacherForm initial={{}} onSubmit={handleSubmit} isPending={isPending} error={error} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function EditTeacherDialog({
  teacher,
  onClose,
}: {
  teacher: Teacher;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const { updateTeacherAction } = await import("@/lib/actions/classes");
      const result = await updateTeacherAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to update");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Teacher — {teacher.fullName}</DialogTitle></DialogHeader>
        <DialogBody>
          <TeacherForm initial={teacher} onSubmit={handleSubmit} isPending={isPending} error={error} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ── Assignment dialogs (using teacher roster select) ────────

function AssignmentForm({
  initial,
  templates,
  teacherRoster,
  onSubmit,
  isPending,
  error,
  isEdit,
}: {
  initial: Partial<MockTeacherPair>;
  templates: MockClass[];
  teacherRoster: Teacher[];
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  error: string | null;
  isEdit?: boolean;
}) {
  const [classId, setClassId] = useState(initial.classId ?? "");
  const activeTeachers = teacherRoster.filter((t) => t.isActive);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (initial.id) fd.set("id", initial.id);
    const tpl = templates.find((t) => t.id === fd.get("classId"));
    fd.set("classTitle", tpl?.title ?? (initial.classTitle || ""));
    onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Class *</label>
        <select
          name="classId"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          required
          disabled={isEdit}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">— Select a class —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Teacher 1 *</label>
          <select
            name="teacher1Id"
            defaultValue={initial.teacher1Id ?? ""}
            required
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
            name="teacher2Id"
            defaultValue={initial.teacher2Id ?? ""}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">— None (solo) —</option>
            {activeTeachers.map((t) => (
              <option key={t.id} value={t.id}>{t.fullName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Effective From *</label>
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={initial.effectiveFrom ?? new Date().toISOString().slice(0, 10)}
            required
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Effective Until</label>
          <input
            name="effectiveUntil"
            type="date"
            defaultValue={initial.effectiveUntil ?? ""}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="hidden"
          name="isActive"
          value={initial.isActive !== false ? "true" : "false"}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={initial.isActive !== false}
            onChange={(e) => {
              const hidden = e.target.form?.querySelector(
                'input[name="isActive"][type="hidden"]'
              ) as HTMLInputElement | null;
              if (hidden) hidden.value = e.target.checked ? "true" : "false";
            }}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          Active
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function AddAssignmentDialog({
  templates,
  teacherRoster,
  onClose,
}: {
  templates: MockClass[];
  teacherRoster: Teacher[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const { createAssignmentAction } = await import("@/lib/actions/classes");
      const result = await createAssignmentAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to create");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Default Assignment</DialogTitle></DialogHeader>
        <DialogBody>
          <AssignmentForm
            initial={{}}
            templates={templates}
            teacherRoster={teacherRoster}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={error}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function EditAssignmentDialog({
  assignment,
  templates,
  teacherRoster,
  onClose,
}: {
  assignment: MockTeacherPair;
  templates: MockClass[];
  teacherRoster: Teacher[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const { updateAssignmentAction } = await import("@/lib/actions/classes");
      const result = await updateAssignmentAction(fd);
      if (result.success) { router.refresh(); onClose(); }
      else setError(result.error ?? "Failed to update");
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Assignment — {assignment.classTitle}</DialogTitle></DialogHeader>
        <DialogBody>
          <AssignmentForm
            initial={assignment}
            templates={templates}
            teacherRoster={teacherRoster}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={error}
            isEdit
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
