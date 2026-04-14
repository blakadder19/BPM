"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Building2,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Users,
  CalendarDays,
  Clock,
  StickyNote,
  Banknote,
  List,
  Calendar,
  Moon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate, cn } from "@/lib/utils";
import type { StoredStudioHire } from "@/lib/services/studio-hire-service";
import type {
  StudioHireStatus,
  StudioHireBookingType,
  StudioHireCancellationOutcome,
} from "@/types/domain";
import {
  findStudioHireConflicts,
  formatConflictMessage,
  isOvernightBooking,
} from "@/lib/domain/studio-hire-conflicts";
import {
  computeDepositSummary,
  computeCancellationSummary,
  centsToEur,
  CANCELLATION_OUTCOME_OPTIONS,
} from "@/lib/domain/studio-hire-financials";
import {
  createStudioHireAction,
  updateStudioHireAction,
  updateStudioHireStatusAction,
  deleteStudioHireAction,
} from "@/lib/actions/studio-hire";
import { StudioHireCalendar } from "./studio-hire-calendar";

// ── Constants ────────────────────────────────────────────────

const STATUS_OPTIONS: { value: StudioHireStatus; label: string }[] = [
  { value: "enquiry", label: "Enquiry" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

const BOOKING_TYPE_OPTIONS: {
  value: StudioHireBookingType;
  label: string;
}[] = [
  { value: "private_event", label: "Private Event" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "workshop", label: "Workshop" },
  { value: "photoshoot", label: "Photoshoot" },
  { value: "other", label: "Other" },
];

const BOOKING_TYPE_LABELS: Record<StudioHireBookingType, string> = {
  private_event: "Private Event",
  rehearsal: "Rehearsal",
  workshop: "Workshop",
  photoshoot: "Photoshoot",
  other: "Other",
};

const INPUT_CLS =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500";

// ── Main Component ───────────────────────────────────────────

type ViewMode = "table" | "calendar";

export function AdminStudioHire({
  entries,
}: {
  entries: StoredStudioHire[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<StoredStudioHire | null>(null);
  const [detail, setDetail] = useState<StoredStudioHire | null>(null);
  const [deleting, setDeleting] = useState<StoredStudioHire | null>(null);

  const filtered = entries.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.requesterName.toLowerCase().includes(q) ||
        e.contactEmail?.toLowerCase().includes(q) ||
        e.bookingType.toLowerCase().includes(q) ||
        e.adminNote?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Studio Hire"
        description="Manage studio hire enquiries and bookings"
        actions={
          <div className="flex items-center gap-2">
            <AdminHelpButton pageKey="studio-hire" />
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
              <button
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "table"
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <List className="h-4 w-4" />
                Table
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "calendar"
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Calendar className="h-4 w-4" />
                Calendar
              </button>
            </div>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Enquiry
            </Button>
          </div>
        }
      />

      {viewMode === "table" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-72">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, type…"
            />
          </div>
          <SelectFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
      )}

      {viewMode === "calendar" ? (
        <StudioHireCalendar
          entries={filtered}
          onEntryClick={(e) => setDetail(e)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No studio hire entries"
          description={
            search || statusFilter
              ? "No entries match your filters."
              : "Create your first studio hire enquiry to get started."
          }
          action={
            !search && !statusFilter ? (
              <Button onClick={() => setShowAdd(true)} variant="outline">
                <Plus className="mr-1.5 h-4 w-4" />
                New Enquiry
              </Button>
            ) : undefined
          }
        />
      ) : (
        <AdminTable
          headers={[
            "Requester",
            "Date / Time",
            "Type",
            "Attendees",
            "Deposit",
            "Status",
            "",
          ]}
          count={filtered.length}
        >
          {filtered.map((e) => (
            <tr
              key={e.id}
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => setDetail(e)}
            >
              <Td>
                <div>
                  <p className="font-medium text-gray-900">
                    {e.requesterName}
                  </p>
                  {e.contactEmail && (
                    <p className="text-xs text-gray-400">{e.contactEmail}</p>
                  )}
                </div>
              </Td>
              <Td>
                <p>{formatDate(e.date)}</p>
                <p className="text-xs text-gray-400">
                  {e.startTime} – {e.endTime}
                  {isOvernightBooking(e.startTime, e.endTime) && (
                    <span className="ml-1 text-bpm-500" title="Ends next day">+1d</span>
                  )}
                </p>
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  {BOOKING_TYPE_LABELS[e.bookingType]}
                  {e.isBlockBooking && (
                    <Badge variant="info">Block</Badge>
                  )}
                </div>
              </Td>
              <Td>{e.expectedAttendees ?? "—"}</Td>
              <Td>
                <DepositBadge entry={e} />
              </Td>
              <Td>
                <StatusBadge status={e.status} />
              </Td>
              <Td>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing(e);
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setDeleting(e);
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}

      {showAdd && <StudioHireFormDialog entries={entries} onClose={() => setShowAdd(false)} />}
      {editing && (
        <StudioHireFormDialog
          entries={entries}
          entry={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {detail && (
        <DetailDialog
          entry={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onStatusChange={(e) => setDetail(e)}
        />
      )}
      {deleting && (
        <DeleteDialog entry={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

// ── Form Dialog (Add / Edit) ─────────────────────────────────

function StudioHireFormDialog({
  entries,
  entry,
  onClose,
}: {
  entries: StoredStudioHire[];
  entry?: StoredStudioHire;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formDate, setFormDate] = useState(entry?.date ?? "");
  const [formStart, setFormStart] = useState(entry?.startTime ?? "");
  const [formEnd, setFormEnd] = useState(entry?.endTime ?? "");

  const isEdit = !!entry;

  const isOvernight = formStart !== "" && formEnd !== "" && formEnd <= formStart;

  const conflictWarning = useMemo(() => {
    if (!formDate || !formStart || !formEnd || formStart === formEnd) return null;
    const { hasConflict, conflicts } = findStudioHireConflicts(
      { date: formDate, startTime: formStart, endTime: formEnd },
      entries,
      entry?.id
    );
    if (!hasConflict) return null;
    return formatConflictMessage(conflicts);
  }, [formDate, formStart, formEnd, entries, entry?.id]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (entry) fd.set("id", entry.id);

    startTransition(async () => {
      const action = isEdit
        ? updateStudioHireAction
        : createStudioHireAction;
      const result = await action(fd);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "An error occurred");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Studio Hire" : "New Studio Hire Enquiry"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <Label>Requester Name *</Label>
              <input
                name="requesterName"
                required
                defaultValue={entry?.requesterName}
                className={INPUT_CLS}
                placeholder="Full name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <input
                  name="contactEmail"
                  type="email"
                  defaultValue={entry?.contactEmail ?? ""}
                  className={INPUT_CLS}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <input
                  name="contactPhone"
                  type="tel"
                  defaultValue={entry?.contactPhone ?? ""}
                  className={INPUT_CLS}
                  placeholder="+353…"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Date *</Label>
                <input
                  name="date"
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <Label>Start Time *</Label>
                <input
                  name="startTime"
                  type="time"
                  required
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <Label>End Time *</Label>
                <input
                  name="endTime"
                  type="time"
                  required
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            {isOvernight && (
              <div className="flex items-center gap-2 rounded-lg border border-bpm-200 bg-bpm-50 px-3 py-2 text-sm text-bpm-700">
                <Moon className="h-4 w-4 flex-shrink-0" />
                Overnight booking — ends next day
              </div>
            )}

            {conflictWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="font-medium">Time conflict: </span>
                {conflictWarning}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Booking Type *</Label>
                <select
                  name="bookingType"
                  required
                  defaultValue={entry?.bookingType ?? "private_event"}
                  className={INPUT_CLS}
                >
                  {BOOKING_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Expected Attendees</Label>
                <input
                  name="expectedAttendees"
                  type="number"
                  min={1}
                  defaultValue={entry?.expectedAttendees ?? ""}
                  className={INPUT_CLS}
                  placeholder="e.g. 20"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isBlockBooking"
                  value="true"
                  defaultChecked={entry?.isBlockBooking}
                  className="rounded border-gray-300"
                />
                Block booking (recurring)
              </label>
            </div>

            <div>
              <Label>Block Details</Label>
              <input
                name="blockDetails"
                defaultValue={entry?.blockDetails ?? ""}
                className={INPUT_CLS}
                placeholder="e.g. Every Tuesday for 6 weeks"
              />
            </div>

            <div>
              <Label>Status</Label>
              <select
                name="status"
                defaultValue={entry?.status ?? "enquiry"}
                className={INPUT_CLS}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium uppercase text-gray-500">
                Deposit
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Deposit Required (€)</Label>
                  <input
                    name="depositRequiredEur"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      entry?.depositRequiredCents != null
                        ? (entry.depositRequiredCents / 100).toFixed(2)
                        : ""
                    }
                    className={INPUT_CLS}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Deposit Paid (€)</Label>
                  <input
                    name="depositPaidEur"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      entry?.depositPaidCents != null
                        ? (entry.depositPaidCents / 100).toFixed(2)
                        : ""
                    }
                    className={INPUT_CLS}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Admin Note</Label>
              <textarea
                name="adminNote"
                rows={2}
                defaultValue={entry?.adminNote ?? ""}
                className={INPUT_CLS}
                placeholder="Internal notes…"
              />
            </div>

            {isEdit && entry?.status === "cancelled" && (
              <div>
                <Label>Cancellation Note</Label>
                <textarea
                  name="cancellationNote"
                  rows={2}
                  defaultValue={entry?.cancellationNote ?? ""}
                  className={INPUT_CLS}
                  placeholder="Reason for cancellation…"
                />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !!conflictWarning}>
              {isPending
                ? "Saving…"
                : isEdit
                  ? "Save Changes"
                  : "Create Enquiry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail Dialog ────────────────────────────────────────────

function DetailDialog({
  entry,
  onClose,
  onEdit,
  onStatusChange,
}: {
  entry: StoredStudioHire;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (updated: StoredStudioHire) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  function changeStatus(newStatus: StudioHireStatus) {
    if (newStatus === "cancelled") {
      setShowCancelDialog(true);
      return;
    }
    startTransition(async () => {
      const result = await updateStudioHireStatusAction(
        entry.id,
        newStatus
      );
      if (result.success) {
        router.refresh();
        onStatusChange({ ...entry, status: newStatus });
      }
    });
  }

  function handleCancelled(updated: StoredStudioHire) {
    setShowCancelDialog(false);
    onStatusChange(updated);
  }

  const nextStatuses = getAvailableTransitions(entry.status);

  return (
    <>
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Studio Hire Details</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {entry.requesterName}
            </h3>
            <StatusBadge status={entry.status} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {entry.contactEmail && (
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="h-4 w-4 text-gray-400" />
                <a
                  href={`mailto:${entry.contactEmail}`}
                  className="text-bpm-600 hover:underline"
                >
                  {entry.contactEmail}
                </a>
              </div>
            )}
            {entry.contactPhone && (
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="h-4 w-4 text-gray-400" />
                {entry.contactPhone}
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-600">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              {formatDate(entry.date)}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="h-4 w-4 text-gray-400" />
              {entry.startTime} – {entry.endTime}
              {isOvernightBooking(entry.startTime, entry.endTime) && (
                <span className="ml-1 inline-flex items-center gap-1 rounded bg-bpm-50 px-1.5 py-0.5 text-xs text-bpm-600">
                  <Moon className="h-3 w-3" /> next day
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 className="h-4 w-4 text-gray-400" />
              {BOOKING_TYPE_LABELS[entry.bookingType]}
              {entry.isBlockBooking && (
                <Badge variant="info">Block</Badge>
              )}
            </div>
            {entry.expectedAttendees && (
              <div className="flex items-center gap-2 text-gray-600">
                <Users className="h-4 w-4 text-gray-400" />
                {entry.expectedAttendees} expected
              </div>
            )}
          </div>

          {entry.blockDetails && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <span className="font-medium">Block details:</span>{" "}
              {entry.blockDetails}
            </div>
          )}

          {entry.adminNote && (
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <StickyNote className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              {entry.adminNote}
            </div>
          )}

          <DepositSummaryCard entry={entry} />

          {entry.status === "cancelled" && (
            <CancellationSummaryCard entry={entry} />
          )}

          {nextStatuses.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium uppercase text-gray-500">
                Update Status
              </p>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => changeStatus(s)}
                  >
                    {isPending ? "…" : STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {showCancelDialog && (
      <CancelStudioHireDialog
        entry={entry}
        onClose={() => setShowCancelDialog(false)}
        onCancelled={handleCancelled}
      />
    )}
    </>
  );
}

// ── Deposit Summary Card ─────────────────────────────────────

function DepositSummaryCard({ entry }: { entry: StoredStudioHire }) {
  const summary = computeDepositSummary(
    entry.depositRequiredCents,
    entry.depositPaidCents
  );
  if (!summary) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-gray-700">
        <Banknote className="h-4 w-4 text-gray-400" />
        Deposit
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-gray-500">Required</p>
          <p className="font-semibold">{centsToEur(summary.requiredCents)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Paid</p>
          <p className={`font-semibold ${summary.paidCents > 0 ? "text-green-700" : ""}`}>
            {centsToEur(summary.paidCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Balance Due</p>
          <p className={`font-semibold ${summary.balanceDueCents > 0 ? "text-amber-700" : "text-green-700"}`}>
            {summary.isFullyPaid ? "Paid" : centsToEur(summary.balanceDueCents)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Cancellation Summary Card ────────────────────────────────

function CancellationSummaryCard({ entry }: { entry: StoredStudioHire }) {
  const summary = computeCancellationSummary(
    entry.cancellationOutcome,
    entry.depositPaidCents,
    entry.refundedCents
  );

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="mb-1 font-medium">Cancelled</p>
      {summary && (
        <div className="space-y-1 text-xs">
          <p>{summary.outcomeLabel}</p>
          {summary.refundedCents > 0 && (
            <p>Refunded: {centsToEur(summary.refundedCents)}</p>
          )}
          {summary.retainedCents > 0 && (
            <p>Retained: {centsToEur(summary.retainedCents)}</p>
          )}
        </div>
      )}
      {entry.cancellationNote && (
        <p className="mt-2 text-xs italic">{entry.cancellationNote}</p>
      )}
      {entry.cancelledAt && (
        <p className="mt-1 text-xs text-red-600">
          Cancelled on {formatDate(entry.cancelledAt.slice(0, 10))}
        </p>
      )}
    </div>
  );
}

// ── Cancel Studio Hire Dialog ────────────────────────────────

function CancelStudioHireDialog({
  entry,
  onClose,
  onCancelled,
}: {
  entry: StoredStudioHire;
  onClose: () => void;
  onCancelled: (updated: StoredStudioHire) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasDeposit =
    (entry.depositPaidCents ?? 0) > 0 ||
    (entry.depositRequiredCents ?? 0) > 0;

  const [outcome, setOutcome] = useState<StudioHireCancellationOutcome>(
    hasDeposit ? "deposit_retained" : "no_deposit"
  );
  const [refundEur, setRefundEur] = useState("");
  const [note, setNote] = useState(entry.cancellationNote ?? "");

  const paidCents = entry.depositPaidCents ?? 0;
  const showRefundInput = outcome === "deposit_partial_refund";
  const refundCents = showRefundInput
    ? Math.round(parseFloat(refundEur || "0") * 100)
    : outcome === "deposit_refunded"
      ? paidCents
      : 0;

  function handleSubmit() {
    setError(null);
    if (showRefundInput && (isNaN(refundCents) || refundCents <= 0)) {
      setError("Enter a valid refund amount.");
      return;
    }
    if (showRefundInput && refundCents > paidCents) {
      setError(`Refund cannot exceed deposit paid (${centsToEur(paidCents)}).`);
      return;
    }
    startTransition(async () => {
      const result = await updateStudioHireStatusAction(entry.id, "cancelled", {
        cancellationNote: note || undefined,
        cancellationOutcome: outcome,
        refundedCents: refundCents > 0 ? refundCents : undefined,
      });
      if (result.success) {
        router.refresh();
        onCancelled({
          ...entry,
          status: "cancelled",
          cancellationOutcome: outcome,
          refundedCents: refundCents > 0 ? refundCents : null,
          cancellationNote: note || null,
          cancelledAt: new Date().toISOString(),
        });
      } else {
        setError(result.error ?? "Failed to cancel");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Studio Hire</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-700">
            Cancel the booking for <strong>{entry.requesterName}</strong> on{" "}
            <strong>{formatDate(entry.date)}</strong> ({entry.startTime}–
            {entry.endTime})?
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {hasDeposit && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <p className="text-xs text-gray-500">
                Deposit required: {centsToEur(entry.depositRequiredCents ?? 0)}
                {" · "}
                Paid: {centsToEur(paidCents)}
              </p>
            </div>
          )}

          <div>
            <Label>Deposit Outcome</Label>
            <select
              value={outcome}
              onChange={(e) =>
                setOutcome(e.target.value as StudioHireCancellationOutcome)
              }
              className={INPUT_CLS}
            >
              {CANCELLATION_OUTCOME_OPTIONS.filter((o) =>
                hasDeposit ? true : o.value === "no_deposit"
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {showRefundInput && (
            <div>
              <Label>Refund Amount (€)</Label>
              <input
                type="number"
                min={0}
                step="0.01"
                max={paidCents / 100}
                value={refundEur}
                onChange={(e) => setRefundEur(e.target.value)}
                className={INPUT_CLS}
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-gray-500">
                Max: {centsToEur(paidCents)}
              </p>
            </div>
          )}

          <div>
            <Label>Cancellation Note</Label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={INPUT_CLS}
              placeholder="Reason for cancellation…"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {isPending ? "Cancelling…" : "Confirm Cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Deposit Badge (table row) ────────────────────────────────

function DepositBadge({ entry }: { entry: StoredStudioHire }) {
  const summary = computeDepositSummary(
    entry.depositRequiredCents,
    entry.depositPaidCents
  );
  if (!summary || summary.requiredCents === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (summary.isFullyPaid) {
    return <Badge variant="success">Paid</Badge>;
  }
  if (summary.paidCents > 0) {
    return <Badge variant="warning">Partial</Badge>;
  }
  return <Badge variant="default">Due {centsToEur(summary.balanceDueCents)}</Badge>;
}

// ── Delete Dialog ────────────────────────────────────────────

function DeleteDialog({
  entry,
  onClose,
}: {
  entry: StoredStudioHire;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteStudioHireAction(entry.id);
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
          <DialogTitle>Delete Studio Hire Entry</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-gray-700">
            Are you sure you want to permanently delete the studio hire
            entry for <strong>{entry.requesterName}</strong> on{" "}
            <strong>{formatDate(entry.date)}</strong>?
          </p>
          <p className="text-xs text-gray-500">
            This action cannot be undone.
          </p>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status transition rules ──────────────────────────────────

function getAvailableTransitions(
  current: StudioHireStatus
): StudioHireStatus[] {
  switch (current) {
    case "enquiry":
      return ["pending", "confirmed", "cancelled"];
    case "pending":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["cancelled"];
    case "cancelled":
      return ["enquiry"];
    default:
      return [];
  }
}
