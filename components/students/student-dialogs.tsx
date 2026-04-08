"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  deleteStudentAction,
} from "@/lib/actions/students";
import {
  createSubscriptionAction,
  updateSubscriptionAction,
  checkPaymentChangeImpactAction,
  applyPaymentChangeAction,
  type PaymentChangeImpact,
} from "@/lib/actions/subscriptions";
import { buildDynamicAccessRulesMap, type StyleAccess } from "@/config/product-access";
import { getNextConsecutiveTerm } from "@/lib/domain/term-rules";
import type { StudentListItem } from "@/types/domain";
import type { MockSubscription, MockProduct, MockTerm, MockDanceStyle } from "@/lib/mock-data";

const SELECT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const SUB_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Finished" },
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
          <Label>Birthday (month &amp; day)</Label>
          <div className="grid grid-cols-2 gap-2">
            <select
              name="dobMonth"
              aria-label="Birth month"
              defaultValue={defaults?.dateOfBirth?.split("-")[0] ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">Month</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1).padStart(2, "0")}>
                  {new Date(2000, i).toLocaleString("en", { month: "long" })}
                </option>
              ))}
            </select>
            <select
              name="dobDay"
              aria-label="Birth day"
              defaultValue={(() => {
                const parts = defaults?.dateOfBirth?.split("-");
                return parts && parts.length >= 2 ? parts[parts.length - 1] : "";
              })()}
              className={SELECT_CLASS}
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={String(i + 1).padStart(2, "0")}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
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

export interface StudentImpact {
  activeSubscriptions: number;
  futureBookings: number;
  pendingPenalties: number;
}

export function DeactivateConfirmDialog({
  student,
  impact,
  onClose,
}: {
  student: StudentListItem;
  impact?: StudentImpact;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isActive = student.isActive;
  const actionLabel = isActive ? "Deactivate" : "Reactivate";
  const hasImpact = impact && isActive && (impact.activeSubscriptions > 0 || impact.futureBookings > 0 || impact.pendingPenalties > 0);

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
        <DialogBody className="space-y-3">
          <p className="text-sm text-gray-600">
            {isActive
              ? `Are you sure you want to deactivate ${student.fullName}? They will no longer appear in active filters, but their data will be preserved.`
              : `Reactivate ${student.fullName}? They will appear in the active students list again.`}
          </p>
          {hasImpact && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">This student currently has:</p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                {impact.activeSubscriptions > 0 && <li>{impact.activeSubscriptions} active subscription{impact.activeSubscriptions !== 1 ? "s" : ""}</li>}
                {impact.futureBookings > 0 && <li>{impact.futureBookings} upcoming booking{impact.futureBookings !== 1 ? "s" : ""}</li>}
                {impact.pendingPenalties > 0 && <li>{impact.pendingPenalties} pending penalt{impact.pendingPenalties !== 1 ? "ies" : "y"}</li>}
              </ul>
              <p className="mt-1 text-xs text-amber-600">Their data will be preserved but they will be hidden from active filters.</p>
            </div>
          )}
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

// ── Delete Student Confirm Dialog ─────────────────────────────

export function DeleteStudentDialog({
  student,
  impact,
  onClose,
}: {
  student: StudentListItem;
  impact?: StudentImpact;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hasImpact = impact && (impact.activeSubscriptions > 0 || impact.futureBookings > 0 || impact.pendingPenalties > 0);

  function handleConfirm() {
    const formData = new FormData();
    formData.set("id", student.id);
    startTransition(async () => {
      const result = await deleteStudentAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Delete failed");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Student</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-gray-600">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold">{student.fullName}</span>? This will
            remove their account, profile, bookings, attendance, and subscriptions. This action
            cannot be undone.
          </p>
          {hasImpact && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-medium">The following data will be permanently removed:</p>
              <ul className="mt-1 list-inside list-disc text-xs text-red-700">
                {impact.activeSubscriptions > 0 && <li>{impact.activeSubscriptions} active subscription{impact.activeSubscriptions !== 1 ? "s" : ""}</li>}
                {impact.futureBookings > 0 && <li>{impact.futureBookings} upcoming booking{impact.futureBookings !== 1 ? "s" : ""}</li>}
                {impact.pendingPenalties > 0 && <li>{impact.pendingPenalties} pending penalt{impact.pendingPenalties !== 1 ? "ies" : "y"}</li>}
              </ul>
              <p className="mt-1 text-xs text-red-600">Consider deactivating instead if you want to preserve their history.</p>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Subscription Dialog (product-aware) ─────────────────

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "revolut", label: "Revolut" },
  { value: "stripe", label: "Stripe" },
  { value: "manual", label: "Manual / Admin Grant" },
  { value: "complimentary", label: "Complimentary" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "complimentary", label: "Complimentary" },
  { value: "waived", label: "Waived" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function groupProducts(products: MockProduct[]) {
  const memberships = products.filter((p) => p.productType === "membership" && p.isActive);
  const passes = products.filter((p) => p.productType === "pass" && p.isActive);
  const dropIns = products.filter((p) => p.productType === "drop_in" && p.isActive);
  return { memberships, passes, dropIns };
}

export function AddSubscriptionDialog({
  studentId,
  products,
  terms,
  danceStyles,
  onClose,
  recommendedStyleName,
}: {
  studentId: string;
  products: MockProduct[];
  terms: MockTerm[];
  danceStyles: MockDanceStyle[];
  onClose: () => void;
  recommendedStyleName?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const groups = groupProducts(products);
  const eligibleTerms = terms.filter((t) => t.status === "active" || t.status === "upcoming");

  useEffect(() => {
    if (!recommendedStyleName || selectedProductId) return;
    const dropIn = products.find((p) => p.productType === "drop_in" && p.isActive);
    if (dropIn) {
      setSelectedProductId(dropIn.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedStyleName]);

  const isSpanProduct = (selectedProduct?.spanTerms ?? 0) >= 2;
  const resolvedNextTerm = useMemo(() => {
    if (!isSpanProduct || !selectedTermId) return null;
    return getNextConsecutiveTerm(terms, selectedTermId);
  }, [isSpanProduct, selectedTermId, terms]);
  const spanTermError = isSpanProduct && selectedTermId && !resolvedNextTerm;

  const accessRulesMap = useMemo(() => buildDynamicAccessRulesMap(products, danceStyles), [products, danceStyles]);
  const accessRule = selectedProductId ? accessRulesMap.get(selectedProductId) : undefined;
  const styleAccess = accessRule?.styleAccess;

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    setSelectedStyleId("");
    setSelectedStyleIds([]);
  }

  function toggleMultiStyle(styleId: string, pickCount: number) {
    setSelectedStyleIds((prev) => {
      if (prev.includes(styleId)) return prev.filter((id) => id !== styleId);
      if (prev.length >= pickCount) return prev;
      return [...prev, styleId];
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (spanTermError) {
      setError("Cannot assign — no next consecutive term exists. Create the next term first.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("productId", selectedProductId);
    formData.set("termId", selectedTermId);

    if (isSpanProduct && resolvedNextTerm) {
      formData.set("spanTerms", String(selectedProduct!.spanTerms));
    }

    if (styleAccess?.type === "selected_style" && selectedStyleId) {
      formData.set("selectedStyleId", selectedStyleId);
      const style = danceStyles.find((s) => s.id === selectedStyleId);
      if (style) formData.set("selectedStyleName", style.name);
    }

    if (styleAccess?.type === "course_group" && selectedStyleIds.length > 0) {
      formData.set("selectedStyleIds", JSON.stringify(selectedStyleIds));
      const names = selectedStyleIds
        .map((id) => danceStyles.find((s) => s.id === id)?.name)
        .filter(Boolean) as string[];
      formData.set("selectedStyleNames", JSON.stringify(names));
    }

    startTransition(async () => {
      const result = await createSubscriptionAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to assign entitlement");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Entitlement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="studentId" value={studentId} />
          <DialogBody className="space-y-4">
            {recommendedStyleName && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                <p className="text-xs text-indigo-800">
                  From QR check-in — recommended for <span className="font-semibold">{recommendedStyleName}</span> class.
                  A drop-in has been pre-selected.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="as-product">Product *</Label>
              <select
                id="as-product"
                value={selectedProductId}
                onChange={(e) => handleProductChange(e.target.value)}
                className={SELECT_CLASS}
                required
              >
                <option value="">Select product…</option>
                {groups.memberships.length > 0 && (
                  <optgroup label="Memberships">
                    {groups.memberships.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.classesPerTerm ? `(${p.classesPerTerm}/term)` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groups.passes.length > 0 && (
                  <optgroup label="Passes">
                    {groups.passes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.totalCredits ? `(${p.totalCredits} classes)` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groups.dropIns.length > 0 && (
                  <optgroup label="Drop-ins">
                    {groups.dropIns.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {selectedProduct?.termBound && (
              <div className="space-y-1.5">
                <Label htmlFor="as-term">
                  {isSpanProduct ? "Start Term *" : "Term"}
                </Label>
                <select
                  id="as-term"
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  className={SELECT_CLASS}
                  required={isSpanProduct}
                >
                  <option value="">{isSpanProduct ? "Select start term…" : "— No term —"}</option>
                  {eligibleTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.startDate} → {t.endDate})
                    </option>
                  ))}
                </select>

                {isSpanProduct && selectedTerm && resolvedNextTerm && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 space-y-1">
                    <p className="font-medium">
                      Covers: {selectedTerm.name} + {resolvedNextTerm.name}
                    </p>
                    <p>
                      Validity: {selectedTerm.startDate} → {resolvedNextTerm.endDate}
                    </p>
                    <p className="text-indigo-600">
                      Covers 4 Beginner 1 classes + 4 Beginner 2 classes in consecutive terms.
                    </p>
                  </div>
                )}

                {spanTermError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    No next consecutive term exists after {selectedTerm?.name ?? "the selected term"}.
                    Please create the next term first, or select an earlier start term.
                  </div>
                )}

                {!isSpanProduct && selectedTerm && (
                  <p className="text-xs text-gray-500">
                    Dates auto-set: {selectedTerm.startDate} → {selectedTerm.endDate}
                  </p>
                )}
              </div>
            )}

            <StyleSelectionField
              styleAccess={styleAccess}
              danceStyles={danceStyles}
              selectedStyleId={selectedStyleId}
              selectedStyleIds={selectedStyleIds}
              onSingleChange={setSelectedStyleId}
              onMultiToggle={toggleMultiStyle}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="as-payment">Payment Method *</Label>
                <select
                  id="as-payment"
                  name="paymentMethod"
                  className={SELECT_CLASS}
                  required
                >
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="as-paymentStatus">Payment Status</Label>
                <select
                  id="as-paymentStatus"
                  name="paymentStatus"
                  defaultValue="paid"
                  className={SELECT_CLASS}
                >
                  {PAYMENT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedProduct?.recurring && (
              <div className="flex items-center gap-2">
                <input
                  id="as-autoRenew"
                  name="autoRenew"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Label htmlFor="as-autoRenew" className="!mb-0">Auto-renew</Label>
              </div>
            )}

            {selectedProduct && (
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-0.5">
                <p><span className="font-medium">Product:</span> {selectedProduct.name}</p>
                {selectedProduct.classesPerTerm && (
                  <p><span className="font-medium">Classes/term:</span> {selectedProduct.classesPerTerm}</p>
                )}
                {selectedProduct.totalCredits && (
                  <p><span className="font-medium">Total classes:</span> {selectedProduct.totalCredits}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="as-notes">Notes</Label>
              <textarea
                id="as-notes"
                name="notes"
                rows={2}
                className={SELECT_CLASS}
                placeholder="Optional notes"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !!spanTermError}>
              {isPending ? "Assigning…" : "Assign Entitlement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Subscription Dialog ─────────────────────────────────

const SENSITIVE_PAYMENT_STATUSES = new Set(["refunded", "cancelled"]);

export function EditSubscriptionDialog({
  subscription: sub,
  products,
  danceStyles,
  onClose,
}: {
  subscription: MockSubscription;
  products: MockProduct[];
  danceStyles: MockDanceStyle[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accessRulesMap = useMemo(() => buildDynamicAccessRulesMap(products, danceStyles), [products, danceStyles]);
  const accessRule = accessRulesMap.get(sub.productId);
  const styleAccess = accessRule?.styleAccess;

  const [selectedStyleId, setSelectedStyleId] = useState(sub.selectedStyleId ?? "");
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>(
    sub.selectedStyleIds ?? []
  );
  const paidAtRef = useRef<HTMLInputElement>(null);
  const [paymentStatusValue, setPaymentStatusValue] = useState(sub.paymentStatus);

  // Confirmation flow state
  const [confirmStep, setConfirmStep] = useState<{
    formData: FormData;
    newPaymentStatus: string;
    impact: PaymentChangeImpact | null;
  } | null>(null);

  function toggleMultiStyle(styleId: string, pickCount: number) {
    setSelectedStyleIds((prev) => {
      if (prev.includes(styleId)) return prev.filter((id) => id !== styleId);
      if (prev.length >= pickCount) return prev;
      return [...prev, styleId];
    });
  }

  function buildFormData(form: HTMLFormElement): FormData {
    const formData = new FormData(form);

    if (styleAccess?.type === "selected_style" && selectedStyleId) {
      formData.set("selectedStyleId", selectedStyleId);
      const style = danceStyles.find((s) => s.id === selectedStyleId);
      if (style) formData.set("selectedStyleName", style.name);
    } else if (!selectedStyleId) {
      formData.set("selectedStyleId", "");
      formData.set("selectedStyleName", "");
    }

    if (styleAccess?.type === "course_group" && selectedStyleIds.length > 0) {
      formData.set("selectedStyleIds", JSON.stringify(selectedStyleIds));
      const names = selectedStyleIds
        .map((id) => danceStyles.find((s) => s.id === id)?.name)
        .filter(Boolean) as string[];
      formData.set("selectedStyleNames", JSON.stringify(names));
    }
    return formData;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = buildFormData(e.currentTarget);
    const newPaymentStatus = formData.get("paymentStatus") as string;
    const isSensitive =
      SENSITIVE_PAYMENT_STATUSES.has(newPaymentStatus) &&
      !SENSITIVE_PAYMENT_STATUSES.has(sub.paymentStatus) &&
      sub.status === "active";

    if (isSensitive) {
      startTransition(async () => {
        const res = await checkPaymentChangeImpactAction(sub.id);
        setConfirmStep({
          formData,
          newPaymentStatus,
          impact: res.success && res.impact ? res.impact : null,
        });
      });
      return;
    }

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

  function handleConfirm(cancelEntitlement: boolean) {
    if (!confirmStep) return;
    startTransition(async () => {
      const result = await applyPaymentChangeAction({
        subscriptionId: sub.id,
        newPaymentStatus: confirmStep.newPaymentStatus as import("@/types/domain").SalePaymentStatus,
        cancelEntitlement,
      });
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to apply changes");
        setConfirmStep(null);
      }
    });
  }

  if (confirmStep) {
    const label = confirmStep.newPaymentStatus === "refunded" ? "Refunded" : "Cancelled";
    const futureCount = confirmStep.impact?.futureBookingsCount ?? 0;

    return (
      <Dialog open onClose={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment Change</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">
                You are marking payment as {label} for:
              </p>
              <p className="text-amber-800 mt-1">{sub.productName}</p>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 space-y-2">
              <p className="font-medium text-gray-900">Payment status and entitlement are separate.</p>
              <p>
                Marking payment as <strong>{label.toLowerCase()}</strong> does not
                automatically cancel the student&apos;s access to classes.
              </p>
              <p>
                Choose what should happen to the entitlement:
              </p>
            </div>

            {futureCount > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium">
                  This student has {futureCount} upcoming booking{futureCount !== 1 ? "s" : ""} using this entitlement.
                </p>
                <p className="mt-1">
                  Cancelling the entitlement will make those bookings ineligible.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full justify-center"
              variant="outline"
              disabled={isPending}
              onClick={() => handleConfirm(false)}
            >
              {isPending ? "Saving…" : `Mark as ${label} — keep entitlement active`}
            </Button>
            <Button
              className="w-full justify-center"
              variant="danger"
              disabled={isPending}
              onClick={() => handleConfirm(true)}
            >
              {isPending ? "Saving…" : `Mark as ${label} — also cancel entitlement`}
            </Button>
            <Button
              className="w-full justify-center"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmStep(null)}
            >
              Go back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Entitlement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="id" value={sub.id} />
          <DialogBody className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              <p className="font-medium text-gray-900">{sub.productName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {sub.validFrom}{sub.validUntil ? ` → ${sub.validUntil}` : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-status">Status</Label>
              <select
                id="es-status"
                name="status"
                defaultValue={sub.status}
                className={SELECT_CLASS}
              >
                {SUB_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <StyleSelectionField
              styleAccess={styleAccess}
              danceStyles={danceStyles}
              selectedStyleId={selectedStyleId}
              selectedStyleIds={selectedStyleIds}
              onSingleChange={setSelectedStyleId}
              onMultiToggle={toggleMultiStyle}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="es-payment">Payment Method</Label>
                <select
                  id="es-payment"
                  name="paymentMethod"
                  defaultValue={sub.paymentMethod}
                  className={SELECT_CLASS}
                >
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="es-paymentStatus">Payment Status</Label>
                <select
                  id="es-paymentStatus"
                  name="paymentStatus"
                  value={paymentStatusValue}
                  onChange={(e) => setPaymentStatusValue(e.target.value as typeof paymentStatusValue)}
                  className={SELECT_CLASS}
                >
                  {PAYMENT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {paymentStatusValue === "paid" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="es-paidAt">Paid At</Label>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                      onClick={() => {
                        if (paidAtRef.current) {
                          const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Dublin" }));
                          const y = now.getFullYear();
                          const mo = String(now.getMonth() + 1).padStart(2, "0");
                          const d = String(now.getDate()).padStart(2, "0");
                          const h = String(now.getHours()).padStart(2, "0");
                          const mi = String(now.getMinutes()).padStart(2, "0");
                          paidAtRef.current.value = `${y}-${mo}-${d}T${h}:${mi}`;
                        }
                      }}
                    >
                      Now
                    </button>
                  </div>
                  <Input
                    ref={paidAtRef}
                    id="es-paidAt"
                    name="paidAt"
                    type="datetime-local"
                    defaultValue={sub.paidAt?.slice(0, 16) ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="es-collectedBy">Collected By</Label>
                  <Input
                    id="es-collectedBy"
                    name="collectedBy"
                    defaultValue={sub.collectedBy ?? ""}
                    placeholder="e.g. Admin, Teacher name"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="es-paymentRef">Payment Reference</Label>
              <Input
                id="es-paymentRef"
                name="paymentReference"
                defaultValue={sub.paymentReference ?? ""}
                placeholder="e.g. Revolut txn, receipt #"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="es-paymentNotes">Payment Notes</Label>
              <textarea
                id="es-paymentNotes"
                name="paymentNotes"
                rows={2}
                defaultValue={sub.paymentNotes ?? ""}
                className={SELECT_CLASS}
                placeholder="e.g. Paid in two instalments"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="es-notes">Notes</Label>
              <textarea
                id="es-notes"
                name="notes"
                rows={2}
                defaultValue={sub.notes ?? ""}
                className={SELECT_CLASS}
                placeholder="Optional notes"
              />
            </div>
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

// ── Style Selection Field (shared between Add and Edit) ──────

function resolveStylePool(styleAccess: StyleAccess, danceStyles: MockDanceStyle[]): MockDanceStyle[] {
  switch (styleAccess.type) {
    case "selected_style":
      if (styleAccess.allowedStyleIds) {
        const allowed = new Set(styleAccess.allowedStyleIds);
        return danceStyles.filter((s) => allowed.has(s.id));
      }
      return [...danceStyles];
    case "course_group": {
      const pool = new Set(styleAccess.poolStyleIds);
      return danceStyles.filter((s) => pool.has(s.id));
    }
    case "fixed": {
      const fixed = new Set(styleAccess.styleIds);
      return danceStyles.filter((s) => fixed.has(s.id));
    }
    default:
      return [];
  }
}

function StyleSelectionField({
  styleAccess,
  danceStyles,
  selectedStyleId,
  selectedStyleIds,
  onSingleChange,
  onMultiToggle,
}: {
  styleAccess: StyleAccess | undefined;
  danceStyles: MockDanceStyle[];
  selectedStyleId: string;
  selectedStyleIds: string[];
  onSingleChange: (id: string) => void;
  onMultiToggle: (id: string, pickCount: number) => void;
}) {
  if (!styleAccess) return null;

  if (styleAccess.type === "selected_style") {
    const styles = resolveStylePool(styleAccess, danceStyles);
    return (
      <div className="space-y-1.5">
        <Label htmlFor="as-style">Style *</Label>
        <select
          id="as-style"
          value={selectedStyleId}
          onChange={(e) => onSingleChange(e.target.value)}
          className={SELECT_CLASS}
          required
        >
          <option value="">Select style…</option>
          {styles.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400">
          Student uses this product for the selected style only.
        </p>
      </div>
    );
  }

  if (styleAccess.type === "course_group") {
    const styles = resolveStylePool(styleAccess, danceStyles);
    const { pickCount } = styleAccess;
    return (
      <div className="space-y-1.5">
        <Label>
          Select {pickCount} style{pickCount !== 1 ? "s" : ""} *
        </Label>
        <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-2">
          {styles.map((s) => {
            const checked = selectedStyleIds.includes(s.id);
            const disabled = !checked && selectedStyleIds.length >= pickCount;
            return (
              <label
                key={s.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onMultiToggle(s.id, pickCount)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                {s.name}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-gray-400">
          {selectedStyleIds.length} of {pickCount} selected.
        </p>
      </div>
    );
  }

  if (styleAccess.type === "fixed") {
    const styles = resolveStylePool(styleAccess, danceStyles);
    if (styles.length === 0) return null;
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <span className="font-medium">Styles:</span>{" "}
        {styles.map((s) => s.name).join(", ")}
      </div>
    );
  }

  return null;
}
