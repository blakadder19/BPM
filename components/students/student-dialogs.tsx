"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createStudentAction,
  updateStudentAction,
  toggleStudentActiveAction,
} from "@/lib/actions/students";
import {
  createSubscriptionAction,
  updateSubscriptionAction,
} from "@/lib/actions/subscriptions";
import type { StudentListItem } from "@/types/domain";
import type { MockSubscription } from "@/lib/mock-data";

const SELECT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const SUB_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Exhausted" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Shared form helpers ──────────────────────────────────────

function StudentFormFields({
  defaults,
  showStatus,
}: {
  defaults?: StudentListItem;
  showStatus?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sf-fullName">Full Name *</Label>
          <Input
            id="sf-fullName"
            name="fullName"
            defaultValue={defaults?.fullName ?? ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sf-email">Email *</Label>
          <Input
            id="sf-email"
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ""}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sf-phone">Phone</Label>
          <Input
            id="sf-phone"
            name="phone"
            defaultValue={defaults?.phone ?? ""}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sf-preferredRole">Preferred Role</Label>
          <select
            id="sf-preferredRole"
            name="preferredRole"
            defaultValue={defaults?.preferredRole ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">None</option>
            <option value="leader">Leader</option>
            <option value="follower">Follower</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sf-dob">Date of Birth</Label>
          <Input
            id="sf-dob"
            name="dateOfBirth"
            type="date"
            defaultValue={defaults?.dateOfBirth ?? ""}
          />
        </div>
        {showStatus && (
          <div className="space-y-1.5">
            <Label htmlFor="sf-active">Status</Label>
            <select
              id="sf-active"
              name="isActive"
              defaultValue={defaults?.isActive !== false ? "true" : "false"}
              className={SELECT_CLASS}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sf-ecName">Emergency Contact</Label>
          <Input
            id="sf-ecName"
            name="emergencyContactName"
            defaultValue={defaults?.emergencyContactName ?? ""}
            placeholder="Name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sf-ecPhone">Emergency Phone</Label>
          <Input
            id="sf-ecPhone"
            name="emergencyContactPhone"
            defaultValue={defaults?.emergencyContactPhone ?? ""}
            placeholder="Phone"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sf-notes">Notes</Label>
        <textarea
          id="sf-notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={SELECT_CLASS}
          placeholder="Optional admin notes"
        />
      </div>
    </>
  );
}

function SubscriptionFormFields({
  defaults,
}: {
  defaults?: {
    productName: string;
    status: string;
    totalCredits: number | null;
    remainingCredits: number | null;
    validFrom: string;
    validUntil: string | null;
    notes: string | null;
  };
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="sub-productName">Product / Subscription Name *</Label>
        <Input
          id="sub-productName"
          name="productName"
          defaultValue={defaults?.productName ?? ""}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sub-status">Status</Label>
        <select
          id="sub-status"
          name="status"
          defaultValue={defaults?.status ?? "active"}
          className={SELECT_CLASS}
        >
          {SUB_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sub-validFrom">Start Date *</Label>
          <Input
            id="sub-validFrom"
            name="validFrom"
            type="date"
            defaultValue={defaults?.validFrom ?? ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-validUntil">End Date</Label>
          <Input
            id="sub-validUntil"
            name="validUntil"
            type="date"
            defaultValue={defaults?.validUntil ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sub-totalCredits">Total Credits</Label>
          <Input
            id="sub-totalCredits"
            name="totalCredits"
            type="number"
            min={0}
            defaultValue={defaults?.totalCredits ?? ""}
            placeholder="Blank = unlimited"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-remainingCredits">Remaining Credits</Label>
          <Input
            id="sub-remainingCredits"
            name="remainingCredits"
            type="number"
            min={0}
            defaultValue={defaults?.remainingCredits ?? ""}
            placeholder="Blank = unlimited"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sub-notes">Notes</Label>
        <textarea
          id="sub-notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={SELECT_CLASS}
          placeholder="Optional notes"
        />
      </div>
    </>
  );
}

// ── Add Student Dialog ───────────────────────────────────────

export function AddStudentDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createStudentAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create student");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <StudentFormFields />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Add Student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Student Dialog ──────────────────────────────────────

export function EditStudentDialog({
  student,
  onClose,
}: {
  student: StudentListItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateStudentAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="id" value={student.id} />
          <DialogBody className="space-y-4">
            <StudentFormFields defaults={student} showStatus />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Deactivate / Reactivate Confirm Dialog ───────────────────

export function DeactivateConfirmDialog({
  student,
  onClose,
}: {
  student: StudentListItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isActive = student.isActive;
  const actionLabel = isActive ? "Deactivate" : "Reactivate";

  function handleConfirm() {
    const formData = new FormData();
    formData.set("id", student.id);
    startTransition(async () => {
      const result = await toggleStudentActiveAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Action failed");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} Student</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-gray-600">
            {isActive
              ? `Are you sure you want to deactivate ${student.fullName}? They will no longer appear in active filters, but their data will be preserved.`
              : `Reactivate ${student.fullName}? They will appear in the active students list again.`}
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isActive ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? `${actionLabel.slice(0, -1)}ing…` : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Subscription Dialog ──────────────────────────────────

export function AddSubscriptionDialog({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createSubscriptionAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create subscription");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Subscription</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="studentId" value={studentId} />
          <DialogBody className="space-y-4">
            <SubscriptionFormFields />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Add Subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Subscription Dialog ─────────────────────────────────

export function EditSubscriptionDialog({
  subscription: sub,
  onClose,
}: {
  subscription: MockSubscription;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateSubscriptionAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to save subscription");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Subscription</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="id" value={sub.id} />
          <DialogBody className="space-y-4">
            <SubscriptionFormFields
              defaults={{
                productName: sub.productName,
                status: sub.status,
                totalCredits: sub.totalCredits,
                remainingCredits: sub.remainingCredits,
                validFrom: sub.validFrom,
                validUntil: sub.validUntil,
                notes: sub.notes,
              }}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
