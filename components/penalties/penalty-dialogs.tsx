"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatCents } from "@/lib/utils";
import {
  updatePenaltyResolution,
  updatePenaltyNotesAction,
  createPenaltyAction,
} from "@/lib/actions/penalties-admin";
import type { StoredPenalty } from "@/lib/services/penalty-service";

export interface PenaltyFees {
  lateCancelCents: number;
  noShowCents: number;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export interface StudentOption {
  id: string;
  fullName: string;
}

export interface ClassOption {
  id: string;
  title: string;
}

function PenaltySummary({ penalty: p }: { penalty: StoredPenalty }) {
  return (
    <div className="space-y-1 text-sm text-gray-600">
      <p>
        <span className="font-medium text-gray-900">{p.studentName}</span> — {p.classTitle}
      </p>
      <p>
        {formatDate(p.classDate)} · <StatusBadge status={p.reason} /> · {formatCents(p.amountCents)}
      </p>
    </div>
  );
}

// ── Resolve Confirm Dialog ───────────────────────────────────

export function ResolveConfirmDialog({
  penalty,
  onClose,
}: {
  penalty: StoredPenalty;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      const result = await updatePenaltyResolution(penalty.id, "credit_deducted");
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to resolve");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Penalty</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Mark this penalty as resolved (credit deducted)?
          </p>
          <PenaltySummary penalty={penalty} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Resolving…" : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Waive Confirm Dialog ─────────────────────────────────────

export function WaiveConfirmDialog({
  penalty,
  onClose,
}: {
  penalty: StoredPenalty;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      const result = await updatePenaltyResolution(penalty.id, "waived");
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to waive");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive Penalty</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Waive this penalty? The student will not be charged.
          </p>
          <PenaltySummary penalty={penalty} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Waiving…" : "Waive Penalty"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reopen Confirm Dialog ────────────────────────────────────

export function ReopenConfirmDialog({
  penalty,
  onClose,
}: {
  penalty: StoredPenalty;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      const result = await updatePenaltyResolution(penalty.id, "monetary_pending");
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to reopen");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen Penalty</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Mark this penalty as unresolved again? It was previously{" "}
            <StatusBadge status={penalty.resolution} />.
          </p>
          <PenaltySummary penalty={penalty} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Reopening…" : "Reopen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Notes Dialog ────────────────────────────────────────

export function EditNotesDialog({
  penalty,
  onClose,
}: {
  penalty: StoredPenalty;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePenaltyNotesAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to save notes");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Notes</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="penaltyId" value={penalty.id} />
          <DialogBody className="space-y-4">
            <PenaltySummary penalty={penalty} />
            <div className="space-y-1.5">
              <Label htmlFor="pen-notes">Admin Notes</Label>
              <textarea
                id="pen-notes"
                name="notes"
                rows={3}
                defaultValue={penalty.notes ?? ""}
                className={INPUT_CLASS}
                placeholder="Internal admin notes about this penalty…"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Notes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm Dialog (dev-only) ─────────────────────────

export function DeleteConfirmDialog({
  penalty,
  onClose,
}: {
  penalty: StoredPenalty;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      const { deletePenaltyAction } = await import(
        "@/lib/actions/penalties-admin"
      );
      const result = await deletePenaltyAction(penalty.id);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to delete");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Penalty (Dev Only)</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Permanently remove this penalty from the local store? This action
            is only available in development.
          </p>
          <PenaltySummary penalty={penalty} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Penalty Dialog ───────────────────────────────────────

const RESOLUTION_OPTIONS = [
  { value: "monetary_pending", label: "Unresolved" },
  { value: "credit_deducted", label: "Resolved (credit deducted)" },
  { value: "waived", label: "Waived" },
];

export function AddPenaltyDialog({
  students,
  classes,
  penaltyFees,
  onClose,
}: {
  students: StudentOption[];
  classes: ClassOption[];
  penaltyFees: PenaltyFees;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("no_show");
  const [amountCents, setAmountCents] = useState(penaltyFees.noShowCents);
  const [selectedStudentName, setSelectedStudentName] = useState("");
  const [selectedClassTitle, setSelectedClassTitle] = useState("");

  const reasonOptions = [
    { value: "no_show", label: `No-show (${formatCents(penaltyFees.noShowCents)})`, cents: penaltyFees.noShowCents },
    { value: "late_cancel", label: `Late Cancel (${formatCents(penaltyFees.lateCancelCents)})`, cents: penaltyFees.lateCancelCents },
  ];

  function handleReasonChange(val: string) {
    setReason(val);
    const opt = reasonOptions.find((o) => o.value === val);
    if (opt) setAmountCents(opt.cents);
  }

  function handleStudentChange(studentId: string) {
    const s = students.find((st) => st.id === studentId);
    setSelectedStudentName(s?.fullName ?? "");
  }

  function handleClassChange(classId: string) {
    const c = classes.find((cl) => cl.id === classId);
    setSelectedClassTitle(c?.title ?? "");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createPenaltyAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create penalty");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Penalty</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-student">Student *</Label>
                <select
                  id="ap-student"
                  name="studentId"
                  required
                  className={INPUT_CLASS}
                  onChange={(e) => handleStudentChange(e.target.value)}
                >
                  <option value="">Select student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="studentName" value={selectedStudentName} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-class">Class *</Label>
                <select
                  id="ap-class"
                  name="bookableClassId"
                  required
                  className={INPUT_CLASS}
                  onChange={(e) => handleClassChange(e.target.value)}
                >
                  <option value="">Select class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="classTitle" value={selectedClassTitle} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-date">Class Date *</Label>
                <input
                  id="ap-date"
                  name="classDate"
                  type="date"
                  required
                  className={INPUT_CLASS}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-reason">Reason *</Label>
                <select
                  id="ap-reason"
                  name="reason"
                  required
                  className={INPUT_CLASS}
                  value={reason}
                  onChange={(e) => handleReasonChange(e.target.value)}
                >
                  {reasonOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-amount">Amount (cents) *</Label>
                <input
                  id="ap-amount"
                  name="amountCents"
                  type="number"
                  min={0}
                  required
                  value={amountCents}
                  onChange={(e) => setAmountCents(Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-resolution">Resolution *</Label>
                <select id="ap-resolution" name="resolution" required className={INPUT_CLASS}>
                  {RESOLUTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-booking">Booking ID</Label>
                <input
                  id="ap-booking"
                  name="bookingId"
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-sub">Subscription ID</Label>
                <input
                  id="ap-sub"
                  name="subscriptionId"
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-credits">Credits Deducted</Label>
                <input
                  id="ap-credits"
                  name="creditDeducted"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap-notes">Admin Notes</Label>
              <textarea
                id="ap-notes"
                name="notes"
                rows={2}
                className={INPUT_CLASS}
                placeholder="Optional internal notes…"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create Penalty"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
