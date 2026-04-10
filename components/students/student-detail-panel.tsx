"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Star, Trash2, AlertTriangle, RotateCw, ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { MockProduct } from "@/lib/mock-data";
import { deriveDisplayStatus } from "@/lib/domain/subscription-display-status";
import { isRenewalEligible } from "@/lib/domain/term-lifecycle";
import { renewSubscriptionAction } from "@/lib/actions/term-lifecycle";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import type { MemberBenefitsSummary } from "@/lib/domain/member-benefits";
import type { AttendanceMark } from "@/types/domain";
import type { StudentListItem } from "@/types/domain";
import type {
  MockSubscription,
  MockTerm,
  MockWalletTx,
  MockBooking,
  MockPenalty,
} from "@/lib/mock-data";

interface AttendanceRecord {
  bookableClassId: string;
  studentId: string;
  status: AttendanceMark;
}

interface StudentDetailPanelProps {
  student: StudentListItem;
  subscriptions: MockSubscription[];
  terms: MockTerm[];
  products?: MockProduct[];
  walletTransactions: MockWalletTx[];
  bookings: MockBooking[];
  penalties: MockPenalty[];
  attendanceRecords?: AttendanceRecord[];
  benefits?: MemberBenefitsSummary | null;
  onAddSub: () => void;
  onEditSub: (sub: MockSubscription) => void;
  colSpan: number;
}

function describeProductScope(p: MockProduct): string {
  const styles = p.allowedStyleNames?.length
    ? p.allowedStyleNames.join(", ")
    : p.styleName ?? "All styles";
  const levels = p.allowedLevels?.length
    ? p.allowedLevels.join(", ")
    : "All levels";
  return `${styles} · ${levels}`;
}

export function StudentDetailPanel({
  student,
  subscriptions,
  terms,
  products = [],
  walletTransactions,
  bookings,
  penalties,
  attendanceRecords,
  benefits,
  onAddSub,
  onEditSub,
  colSpan,
}: StudentDetailPanelProps) {
  const router = useRouter();
  const [removeTarget, setRemoveTarget] = useState<MockSubscription | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockSubscription | null>(null);
  const [renewPendingId, setRenewPendingId] = useState<string | null>(null);
  const [renewTransPending, startRenewTransition] = useTransition();
  const termsById = new Map(terms.map((t) => [t.id, t]));
  const subs = subscriptions.filter((s) => s.studentId === student.id);
  const activeSubs = subs.filter((s) => s.status === "active");
  const inactiveSubs = subs.filter((s) => s.status !== "active");

  const renewEligibleIds = useMemo(() => {
    const set = new Set<string>();
    for (const sub of subs) {
      if (isRenewalEligible(sub, subs, terms)) set.add(sub.id);
    }
    return set;
  }, [subs, terms]);

  function handleRenew(sub: MockSubscription) {
    setRenewPendingId(sub.id);
    startRenewTransition(async () => {
      await renewSubscriptionAction(sub.id);
      setRenewPendingId(null);
      router.refresh();
    });
  }

  const allTxs = walletTransactions
    .filter((tx) => tx.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const recentBookings = bookings
    .filter((b) =>
      b.studentId === student.id &&
      (b.status === "confirmed" || b.status === "checked_in") &&
      b.date !== ""
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const studentPenalties = penalties
    .filter((p) => p.studentId === student.id)
    .sort((a, b) => {
      const aUnresolved = a.resolution === "monetary_pending" ? 0 : 1;
      const bUnresolved = b.resolution === "monetary_pending" ? 0 : 1;
      if (aUnresolved !== bUnresolved) return aUnresolved - bUnresolved;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <tr>
      <td colSpan={colSpan} className="bg-gray-50 p-0">
        <div className="grid gap-5 px-8 py-5 md:grid-cols-2">
          {/* ── Profile section ── */}
          <Section title="Profile">
            <DL label="Student ID" value={student.id} />
            <DL label="Email" value={student.email} />
            <DL label="Phone" value={student.phone ?? "—"} />
            <DL
              label="Preferred Role"
              value={student.preferredRole ? student.preferredRole.charAt(0).toUpperCase() + student.preferredRole.slice(1) : "—"}
            />
            <DL label="Joined" value={formatDate(student.joinedAt)} />
            <DL
              label="Birthday"
              value={
                student.dateOfBirth
                  ? (() => {
                      const parts = student.dateOfBirth.split("-");
                      if (parts.length === 2 && /^\d{2}$/.test(parts[0])) {
                        const m = parseInt(parts[0], 10) - 1;
                        const d = parseInt(parts[1], 10);
                        return `${d} ${new Date(2000, m).toLocaleString("en", { month: "long" })}`;
                      }
                      return formatDate(student.dateOfBirth);
                    })()
                  : "—"
              }
            />
            <DL label="Emergency Contact" value={student.emergencyContactName ?? "—"} />
            {student.emergencyContactPhone && (
              <DL label="Emergency Phone" value={student.emergencyContactPhone} />
            )}
            {student.notes && <DL label="Notes" value={student.notes} />}
          </Section>

          {/* ── Member Benefits (admin view) ── */}
          {benefits?.isMember && (
            <Section title="Member Benefits">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  benefits.birthdayWeekEligible
                    ? benefits.birthdayFreeClassUsed
                      ? "bg-gray-100 text-gray-600"
                      : "bg-green-100 text-green-700"
                    : benefits.birthdayFreeClassUsed
                      ? "bg-gray-100 text-gray-600"
                      : "bg-gray-100 text-gray-500"
                }`}>
                  Birthday class: {benefits.birthdayFreeClassUsed
                    ? `used${benefits.birthdayClassTitle ? ` (${benefits.birthdayClassTitle}${benefits.birthdayClassDate ? ` · ${benefits.birthdayClassDate}` : ""})` : ""}`
                    : benefits.birthdayWeekEligible
                      ? "eligible"
                      : "not birthday week"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Giveaway eligible
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Free Student Practice
                </span>
              </div>
            </Section>
          )}

          {/* ── Subscriptions section ── */}
          <Section
            title="Subscriptions"
            action={
              <button
                onClick={onAddSub}
                className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            }
          >
            {subs.length === 0 ? (
              <p className="text-sm text-gray-400">No subscriptions yet.</p>
            ) : (
              <div className="space-y-2">
                {activeSubs.length > 0 && (
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                    Active Products ({activeSubs.length})
                  </p>
                )}
                {activeSubs.map((sub) => (
                  <SubCard key={sub.id} sub={sub} allStudentSubs={subs} termsById={termsById} products={products} onEdit={onEditSub} onRemove={setRemoveTarget} onDelete={setDeleteTarget} renewEligible={renewEligibleIds.has(sub.id)} onRenew={handleRenew} renewPending={renewTransPending && renewPendingId === sub.id} />
                ))}
                {inactiveSubs.length > 0 && (
                  <InactiveSubsHistory
                    inactiveSubs={inactiveSubs}
                    allStudentSubs={subs}
                    termsById={termsById}
                    products={products}
                    onEdit={onEditSub}
                    onRemove={setRemoveTarget}
                    onDelete={setDeleteTarget}
                    renewEligibleIds={renewEligibleIds}
                    onRenew={handleRenew}
                    renewTransPending={renewTransPending}
                    renewPendingId={renewPendingId}
                  />
                )}
              </div>
            )}
          </Section>

          {/* ── Credits & Wallet section ── */}
          <Section title="Credits & Wallet">
            {subs.length > 0 && (
              <div className="mb-2 space-y-1">
                {subs
                  .filter((s) => s.status === "active")
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate">{s.productName}</span>
                      <span className="font-medium text-gray-900">
                        {s.productType === "membership"
                          ? s.classesPerTerm !== null
                            ? `Used ${s.classesUsed} / ${s.classesPerTerm} · ${s.classesPerTerm - s.classesUsed} left`
                            : `${s.classesUsed} classes used`
                          : s.totalCredits !== null && s.remainingCredits !== null
                            ? `Used ${s.totalCredits - s.remainingCredits} / ${s.totalCredits} · ${s.remainingCredits} left`
                            : s.remainingCredits !== null
                              ? `${s.remainingCredits} credit${s.remainingCredits !== 1 ? "s" : ""} left`
                              : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {allTxs.length === 0 ? (
              <p className="text-sm text-gray-400">No transactions.</p>
            ) : (
              <PaginatedTransactions transactions={allTxs} />
            )}
          </Section>

          {/* ── Bookings section ── */}
          <Section title="Recent Bookings">
            {recentBookings.length === 0 ? (
              <p className="text-sm text-gray-400">No bookings.</p>
            ) : (
              <div className="space-y-1.5">
                {recentBookings.map((b) => {
                  const attRecord = attendanceRecords?.find(
                    (a) => a.bookableClassId === b.bookableClassId && a.studentId === b.studentId
                  );
                  const displayStatus = resolveStudentVisibleStatus(b.status, attRecord?.status ?? null);
                  return (
                    <div key={b.id} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 whitespace-nowrap">{formatDate(b.date)}</span>
                      <span className="flex-1 truncate text-gray-800">{b.classTitle}</span>
                      <StatusBadge status={displayStatus} />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── Penalties section ── */}
          {studentPenalties.length > 0 && (
            <Section title="Penalties" className="md:col-span-2">
              <PaginatedPenalties penalties={studentPenalties} />
            </Section>
          )}
        </div>
        {removeTarget && (
          <RemoveSubscriptionDialog
            sub={removeTarget}
            studentName={student.fullName}
            bookings={bookings}
            onClose={() => setRemoveTarget(null)}
          />
        )}
        {deleteTarget && (
          <DeleteSubscriptionDialog
            sub={deleteTarget}
            studentName={student.fullName}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </td>
    </tr>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function Section({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function DL({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-36 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

const HISTORY_PREVIEW = 3;

function InactiveSubsHistory({
  inactiveSubs,
  allStudentSubs,
  termsById,
  products,
  onEdit,
  onRemove,
  onDelete,
  renewEligibleIds,
  onRenew,
  renewTransPending,
  renewPendingId,
}: {
  inactiveSubs: MockSubscription[];
  allStudentSubs: MockSubscription[];
  termsById: Map<string, MockTerm>;
  products: MockProduct[];
  onEdit: (sub: MockSubscription) => void;
  onRemove: (sub: MockSubscription) => void;
  onDelete: (sub: MockSubscription) => void;
  renewEligibleIds: Set<string>;
  onRenew: (sub: MockSubscription) => void;
  renewTransPending: boolean;
  renewPendingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleSubs = expanded
    ? showAll
      ? inactiveSubs
      : inactiveSubs.slice(0, HISTORY_PREVIEW)
    : [];
  const hasMore = inactiveSubs.length > HISTORY_PREVIEW;

  return (
    <div className="pt-1 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded px-0.5 py-0.5 text-left hover:bg-gray-100 transition-colors"
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
          Product History ({inactiveSubs.length})
        </p>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {expanded && (
        <>
          {visibleSubs.map((sub) => (
            <SubCard
              key={sub.id}
              sub={sub}
              allStudentSubs={allStudentSubs}
              termsById={termsById}
              products={products}
              onEdit={onEdit}
              onRemove={onRemove}
              onDelete={onDelete}
              renewEligible={renewEligibleIds.has(sub.id)}
              onRenew={onRenew}
              renewPending={renewTransPending && renewPendingId === sub.id}
            />
          ))}
          {hasMore && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all {inactiveSubs.length} past products
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PaginatedTransactions({ transactions }: { transactions: MockWalletTx[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? transactions : transactions.slice(0, 10);
  const hasMore = transactions.length > 10;

  return (
    <div className="space-y-1">
      {visible.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 text-xs text-gray-600"
        >
          <span className={tx.credits < 0 ? "text-red-600" : "text-green-600"}>
            {tx.credits > 0 ? "+" : ""}
            {tx.credits}
          </span>
          <span className="flex-1 truncate">{tx.description}</span>
          <span className="whitespace-nowrap text-gray-400">
            {formatDate(tx.createdAt)}
          </span>
        </div>
      ))}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 pt-1"
        >
          View all {transactions.length} transactions
        </button>
      )}
    </div>
  );
}

function PaginatedPenalties({ penalties }: { penalties: MockPenalty[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? penalties : penalties.slice(0, 5);
  const hasMore = penalties.length > 5;

  return (
    <div className="space-y-1.5">
      {visible.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
          <span className="text-gray-500 whitespace-nowrap">{formatDate(p.date)}</span>
          <span className="text-gray-800">{p.classTitle}</span>
          <StatusBadge status={p.reason} />
          <span className="text-gray-600">
            €{(p.amountCents / 100).toFixed(2)}
          </span>
          <StatusBadge status={p.resolution} />
        </div>
      ))}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 pt-1"
        >
          View all {penalties.length} penalties
        </button>
      )}
    </div>
  );
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: "Stripe",
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  revolut: "Revolut",
  manual: "Manual",
  complimentary: "Complimentary",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  complimentary: "Comp",
  waived: "Waived",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function SubCard({
  sub,
  allStudentSubs,
  termsById,
  products,
  onEdit,
  onRemove,
  onDelete,
  renewEligible,
  onRenew,
  renewPending,
}: {
  sub: MockSubscription;
  allStudentSubs: MockSubscription[];
  termsById: Map<string, MockTerm>;
  products: MockProduct[];
  onEdit: (sub: MockSubscription) => void;
  onRemove: (sub: MockSubscription) => void;
  onDelete: (sub: MockSubscription) => void;
  renewEligible?: boolean;
  onRenew?: (sub: MockSubscription) => void;
  renewPending?: boolean;
}) {
  const product = products.find((p) => p.id === sub.productId);
  const term = sub.termId ? termsById.get(sub.termId) : null;
  const isActive = sub.status === "active";
  const displayStatus = deriveDisplayStatus(sub, allStudentSubs);
  const expiryDays = isActive && sub.validUntil
    ? Math.round((new Date(sub.validUntil + "T00:00:00Z").getTime() - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()) / 86400000)
    : null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm ${
        isActive
          ? "border-gray-200 bg-white"
          : "border-gray-100 bg-gray-50 opacity-80"
      }`}
    >
      <span className={`font-medium ${isActive ? "text-gray-900" : "text-gray-500"}`}>
        {sub.productName}
      </span>
      <StatusBadge status={displayStatus} />
      {sub.productType === "membership" ? (
        <span className="text-gray-500">
          {sub.classesPerTerm !== null
            ? `Used ${sub.classesUsed} / ${sub.classesPerTerm} · ${sub.classesPerTerm - sub.classesUsed} left`
            : `${sub.classesUsed} classes used`}
        </span>
      ) : sub.productType === "drop_in" ? (
        <span className="text-gray-500">1 class</span>
      ) : (
        <span className="text-gray-500">
          {sub.totalCredits !== null && sub.remainingCredits !== null
            ? `Used ${sub.totalCredits - sub.remainingCredits} / ${sub.totalCredits} · ${sub.remainingCredits} left`
            : sub.remainingCredits !== null
              ? `${sub.remainingCredits} credit${sub.remainingCredits !== 1 ? "s" : ""} left`
              : "—"}
        </span>
      )}
      {term ? (
        <span className="text-gray-500">{term.name}</span>
      ) : (
        <span className="text-gray-500">
          {formatDate(sub.validFrom)}
          {sub.validUntil ? ` → ${formatDate(sub.validUntil)}` : ""}
        </span>
      )}
      <Badge variant="default">{PAYMENT_METHOD_LABELS[sub.paymentMethod] ?? sub.paymentMethod}</Badge>
      {sub.paymentStatus && (
        <Badge variant={
          sub.paymentStatus === "paid"
            ? "success"
            : sub.paymentStatus === "complimentary"
              ? "default"
              : sub.paymentStatus === "cancelled" || sub.paymentStatus === "refunded"
                ? "danger"
                : "warning"
        }>
          {sub.paymentStatus === "paid"
            ? "Paid"
            : sub.paymentStatus === "complimentary"
              ? "Comp"
              : PAYMENT_STATUS_LABELS[sub.paymentStatus] ?? sub.paymentStatus}
        </Badge>
      )}
      {sub.autoRenew && (
        <span className="text-[10px] text-indigo-600 font-medium">Auto-renew</span>
      )}
      {expiryDays !== null && expiryDays <= 7 && expiryDays >= 0 && (
        <Badge variant={expiryDays <= 2 ? "danger" : "warning"}>
          {expiryDays === 0
            ? "Expires today"
            : expiryDays === 1
              ? "Expires tomorrow"
              : `Expires in ${expiryDays}d`}
        </Badge>
      )}
      {sub.selectedStyleName && (
        <span className="text-gray-500">Style: {sub.selectedStyleName}</span>
      )}
      {sub.selectedStyleNames && sub.selectedStyleNames.length > 0 && (
        <span className="text-gray-500">
          Styles: {sub.selectedStyleNames.join(", ")}
        </span>
      )}
      {product && (
        <span className="text-xs text-gray-400">{describeProductScope(product)}</span>
      )}
      {product?.isProvisional && <StatusBadge status="provisional" />}
      <span className="text-xs text-gray-400">
        {sub.renewedFromId && sub.notes?.includes("Auto-renewal")
          ? `Auto-renewed${sub.assignedAt ? ` on ${formatDate(sub.assignedAt)}` : ""}`
          : sub.notes?.includes("self-purchase") || sub.notes?.includes("Self-purchase")
            ? `Self-purchase${sub.assignedAt ? ` on ${formatDate(sub.assignedAt)}` : ""}`
            : sub.assignedBy
              ? `Admin-assigned${sub.assignedAt ? ` on ${formatDate(sub.assignedAt)}` : ""}`
              : sub.renewedFromId
                ? `Renewed${sub.assignedAt ? ` on ${formatDate(sub.assignedAt)}` : ""}`
                : `Admin-assigned${sub.assignedAt ? ` on ${formatDate(sub.assignedAt)}` : ""}`}
      </span>
      {sub.renewedFromId && (
        <span className="text-[10px] text-indigo-500 font-medium">Renewal</span>
      )}
      {sub.paymentStatus === "paid" && (sub.paidAt || sub.collectedBy || sub.paymentReference) && (
        <span className="w-full text-xs text-gray-400">
          {sub.paidAt ? `Paid ${formatDate(sub.paidAt)}` : ""}
          {sub.collectedBy ? ` · Collected by ${sub.collectedBy}` : ""}
          {sub.paymentReference ? ` · Ref: ${sub.paymentReference}` : ""}
        </span>
      )}
      {sub.paymentStatus === "paid" && sub.paymentNotes && (
        <span className="w-full text-xs text-gray-400 italic">Payment: {sub.paymentNotes}</span>
      )}
      {sub.notes && !(sub.paymentStatus !== "pending" && sub.notes.includes("payment pending")) && (
        <span className="w-full text-xs text-gray-400 italic">{sub.notes}</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {renewEligible && onRenew && (
          <button
            onClick={() => onRenew(sub)}
            disabled={renewPending}
            className="rounded-lg p-1 text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
            title="Renew for next term"
          >
            <RotateCw className={`h-3.5 w-3.5 ${renewPending ? "animate-spin" : ""}`} />
          </button>
        )}
        <button
          onClick={() => onEdit(sub)}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Edit subscription"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {isActive ? (
          <button
            onClick={() => onRemove(sub)}
            className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Cancel this product assignment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={() => onDelete(sub)}
            className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Permanently remove this historical record"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function RemoveSubscriptionDialog({
  sub,
  studentName,
  bookings,
  onClose,
}: {
  sub: MockSubscription;
  studentName: string;
  bookings: MockBooking[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bookingAction, setBookingAction] = useState<"keep" | "remove_all" | "select">("keep");
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());

  const hasUsage = sub.classesUsed > 0
    || (sub.totalCredits !== null && sub.remainingCredits !== null && sub.remainingCredits < sub.totalCredits);

  const today = new Date().toISOString().slice(0, 10);
  const relatedBookings = bookings.filter(
    (b) =>
      b.subscriptionId === sub.id &&
      b.studentId === sub.studentId &&
      (b.status === "confirmed" || b.status === "checked_in") &&
      b.date >= today
  );

  function toggleBooking(id: string) {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      let cancelIds: string[] | undefined;
      if (relatedBookings.length > 0) {
        if (bookingAction === "remove_all") {
          cancelIds = relatedBookings.map((b) => b.id);
        } else if (bookingAction === "select") {
          cancelIds = [...selectedBookingIds];
        }
      }
      const { removeStudentSubscriptionAction } = await import("@/lib/actions/students");
      const result = await removeStudentSubscriptionAction(sub.id, cancelIds);
      if (result.success) {
        onClose();
        router.refresh();
      } else {
        setError(result.error ?? "Failed to remove subscription.");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Product from Student</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-gray-700">
            Remove <strong>{sub.productName}</strong> from <strong>{studentName}</strong>?
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> This will end the subscription
            </p>
            <ul className="list-disc pl-5 text-sm text-amber-700 space-y-1">
              <li>The subscription will be marked as <strong>Cancelled</strong>.</li>
              <li>Auto-renew will be turned off.</li>
              <li>The student will no longer be able to use this product for bookings.</li>
              {hasUsage && (
                <li>This student has already used classes on this product. Usage history will be preserved.</li>
              )}
            </ul>
          </div>

          {relatedBookings.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
              <p className="text-sm font-medium text-blue-800">
                This product has {relatedBookings.length} upcoming booking{relatedBookings.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="bookingAction"
                    checked={bookingAction === "keep"}
                    onChange={() => setBookingAction("keep")}
                    className="text-indigo-600"
                  />
                  Keep all bookings
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="bookingAction"
                    checked={bookingAction === "remove_all"}
                    onChange={() => setBookingAction("remove_all")}
                    className="text-indigo-600"
                  />
                  Cancel all related bookings
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="bookingAction"
                    checked={bookingAction === "select"}
                    onChange={() => setBookingAction("select")}
                    className="text-indigo-600"
                  />
                  Choose which bookings to cancel
                </label>
              </div>
              {bookingAction === "select" && (
                <div className="space-y-1.5 border-t border-blue-200 pt-2">
                  {relatedBookings.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBookingIds.has(b.id)}
                        onChange={() => toggleBooking(b.id)}
                        className="text-indigo-600 rounded"
                      />
                      <span className="font-medium">{b.classTitle}</span>
                      <span className="text-gray-500">{formatDate(b.date)}</span>
                      <StatusBadge status={b.status} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Removing…" : "Remove Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSubscriptionDialog({
  sub,
  studentName,
  onClose,
}: {
  sub: MockSubscription;
  studentName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasUsage = sub.classesUsed > 0
    || (sub.totalCredits !== null && sub.remainingCredits !== null && sub.remainingCredits < sub.totalCredits);

  function handleConfirm() {
    startTransition(async () => {
      const { deleteStudentSubscriptionAction } = await import("@/lib/actions/students");
      const result = await deleteStudentSubscriptionAction(sub.id);
      if (result.success) {
        onClose();
        router.refresh();
      } else {
        setError(result.error ?? "Failed to delete record.");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently Delete Record</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-gray-700">
            Permanently remove the <strong>{sub.productName}</strong> record from <strong>{studentName}</strong>?
          </p>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> This action cannot be undone
            </p>
            <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
              <li>This historical record will be permanently deleted.</li>
              <li>The link between this student and this product will be fully removed.</li>
              {hasUsage && (
                <li>This record shows {sub.classesUsed} class{sub.classesUsed !== 1 ? "es" : ""} used. Usage history will be lost.</li>
              )}
            </ul>
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
