"use client";

import { Pencil, Plus, Star } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getAccessRule, describeAccess } from "@/config/product-access";
import { deriveDisplayStatus } from "@/lib/domain/subscription-display-status";
import type { MemberBenefitsSummary } from "@/lib/domain/member-benefits";
import type { StudentListItem } from "@/types/domain";
import type {
  MockSubscription,
  MockTerm,
  MockWalletTx,
  MockBooking,
  MockPenalty,
} from "@/lib/mock-data";

interface StudentDetailPanelProps {
  student: StudentListItem;
  subscriptions: MockSubscription[];
  terms: MockTerm[];
  walletTransactions: MockWalletTx[];
  bookings: MockBooking[];
  penalties: MockPenalty[];
  benefits?: MemberBenefitsSummary | null;
  onAddSub: () => void;
  onEditSub: (sub: MockSubscription) => void;
  colSpan: number;
}

export function StudentDetailPanel({
  student,
  subscriptions,
  terms,
  walletTransactions,
  bookings,
  penalties,
  benefits,
  onAddSub,
  onEditSub,
  colSpan,
}: StudentDetailPanelProps) {
  const termsById = new Map(terms.map((t) => [t.id, t]));
  const subs = subscriptions.filter((s) => s.studentId === student.id);
  const activeSubs = subs.filter((s) => s.status === "active");
  const inactiveSubs = subs.filter((s) => s.status !== "active");

  const txs = walletTransactions
    .filter((tx) => tx.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const recentBookings = bookings
    .filter((b) => b.studentId === student.id)
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
              label="Date of Birth"
              value={student.dateOfBirth ? formatDate(student.dateOfBirth) : "—"}
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
                    : "bg-gray-100 text-gray-500"
                }`}>
                  Birthday class: {benefits.birthdayWeekEligible
                    ? benefits.birthdayFreeClassUsed ? "used" : "eligible"
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
                  <SubCard key={sub.id} sub={sub} allStudentSubs={subs} termsById={termsById} onEdit={onEditSub} />
                ))}
                {inactiveSubs.length > 0 && (
                  <>
                    <p className="pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                      Product History ({inactiveSubs.length})
                    </p>
                    {inactiveSubs.map((sub) => (
                      <SubCard key={sub.id} sub={sub} allStudentSubs={subs} termsById={termsById} onEdit={onEditSub} />
                    ))}
                  </>
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
                        {s.productType === "membership" && s.classesPerTerm !== null
                          ? `Used ${s.classesUsed} / ${s.classesPerTerm} · ${s.classesPerTerm - s.classesUsed} left`
                          : s.remainingCredits === null
                            ? "∞"
                            : s.totalCredits !== null
                              ? `Used ${s.totalCredits - s.remainingCredits} / ${s.totalCredits} · ${s.remainingCredits} left`
                              : `${s.remainingCredits} credit${s.remainingCredits !== 1 ? "s" : ""} left`}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {txs.length === 0 ? (
              <p className="text-sm text-gray-400">No transactions.</p>
            ) : (
              <div className="space-y-1">
                {txs.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 text-xs text-gray-600"
                  >
                    <span
                      className={tx.credits < 0 ? "text-red-600" : "text-green-600"}
                    >
                      {tx.credits > 0 ? "+" : ""}
                      {tx.credits}
                    </span>
                    <span className="flex-1 truncate">{tx.description}</span>
                    <span className="whitespace-nowrap text-gray-400">
                      {formatDate(tx.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Bookings section ── */}
          <Section title="Recent Bookings">
            {recentBookings.length === 0 ? (
              <p className="text-sm text-gray-400">No bookings.</p>
            ) : (
              <div className="space-y-1.5">
                {recentBookings.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 whitespace-nowrap">{formatDate(b.date)}</span>
                    <span className="flex-1 truncate text-gray-800">{b.classTitle}</span>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Penalties section ── */}
          {studentPenalties.length > 0 && (
            <Section title="Penalties" className="md:col-span-2">
              <div className="space-y-1.5">
                {studentPenalties.map((p) => (
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
              </div>
            </Section>
          )}
        </div>
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
};

function SubCard({
  sub,
  allStudentSubs,
  termsById,
  onEdit,
}: {
  sub: MockSubscription;
  allStudentSubs: MockSubscription[];
  termsById: Map<string, MockTerm>;
  onEdit: (sub: MockSubscription) => void;
}) {
  const rule = getAccessRule(sub.productId);
  const term = sub.termId ? termsById.get(sub.termId) : null;
  const isActive = sub.status === "active";
  const displayStatus = deriveDisplayStatus(sub, allStudentSubs);

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
      {sub.productType === "membership" && sub.classesPerTerm !== null ? (
        <span className="text-gray-500">
          Used {sub.classesUsed} / {sub.classesPerTerm} · {sub.classesPerTerm - sub.classesUsed} left
        </span>
      ) : (
        <span className="text-gray-500">
          {sub.remainingCredits === null
            ? "∞"
            : sub.totalCredits !== null
              ? `Used ${sub.totalCredits - sub.remainingCredits} / ${sub.totalCredits} · ${sub.remainingCredits} left`
              : `${sub.remainingCredits} credit${sub.remainingCredits !== 1 ? "s" : ""} left`}
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
      {sub.paymentStatus && sub.paymentStatus !== "paid" && (
        <Badge variant="warning">
          {PAYMENT_STATUS_LABELS[sub.paymentStatus] ?? sub.paymentStatus}
        </Badge>
      )}
      {sub.autoRenew && (
        <span className="text-[10px] text-indigo-600 font-medium">Auto-renew</span>
      )}
      {sub.selectedStyleName && (
        <span className="text-gray-500">Style: {sub.selectedStyleName}</span>
      )}
      {sub.selectedStyleNames && sub.selectedStyleNames.length > 0 && (
        <span className="text-gray-500">
          Styles: {sub.selectedStyleNames.join(", ")}
        </span>
      )}
      {rule && (
        <span className="text-xs text-gray-400">{describeAccess(rule)}</span>
      )}
      {rule?.isProvisional && <StatusBadge status="provisional" />}
      {sub.assignedBy && (
        <span className="text-xs text-gray-400">
          Assigned by {sub.assignedBy}
          {sub.assignedAt ? ` on ${formatDate(sub.assignedAt)}` : ""}
        </span>
      )}
      {sub.notes && (
        <span className="w-full text-xs text-gray-400 italic">{sub.notes}</span>
      )}
      <button
        onClick={() => onEdit(sub)}
        className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title="Edit subscription"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
