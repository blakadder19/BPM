"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  Banknote,
  Lock,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { getTodayStr, eventCalendarDate } from "@/lib/domain/datetime";
import { formatEventDateRange } from "@/lib/utils";
import type { MockSpecialEvent, MockEventProduct, MockEventPurchase } from "@/lib/mock-data";
import {
  eventCheckInAction,
  eventUndoCheckInAction,
  eventCollectPaymentAndCheckInAction,
} from "@/lib/actions/event-checkin";

// ── Constants ────────────────────────────────────────────────

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  full_pass: "Full Pass",
  combo_pass: "Combo Pass",
  single_session: "Single Session",
  social_ticket: "Social Ticket",
  other: "Other",
};

function centsToEuros(c: number): string {
  return `€${(c / 100).toFixed(2)}`;
}

// ── Types ────────────────────────────────────────────────────

type FilterPayment = "all" | "paid" | "pending";
type FilterCheckIn = "all" | "checked_in" | "not_checked_in";
type FilterPerson = "all" | "student" | "guest";

interface PurchaseRow {
  purchase: MockEventPurchase;
  personName: string;
  personEmail: string;
  personType: "student" | "guest";
  productName: string;
  productType: string;
}

interface Props {
  event: MockSpecialEvent;
  products: MockEventProduct[];
  purchases: MockEventPurchase[];
  studentInfoMap: Record<string, { fullName: string; email: string }>;
  currentUserId: string;
}

// ── Component ────────────────────────────────────────────────

export function EventOperations({ event, products, purchases, studentInfoMap }: Props) {
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Event window check (calendar-day span: check-in enabled for all days covered by the event)
  const today = getTodayStr();
  const startDay = eventCalendarDate(event.startDate);
  const endDay = eventCalendarDate(event.endDate);
  const isBefore = today < startDay;
  const isAfter = today > endDay;
  const isLive = !isBefore && !isAfter;

  // Search / filter state
  const [search, setSearch] = useState("");
  const [filterPayment, setFilterPayment] = useState<FilterPayment>("all");
  const [filterCheckIn, setFilterCheckIn] = useState<FilterCheckIn>("all");
  const [filterPerson, setFilterPerson] = useState<FilterPerson>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");

  // Check-in action state
  const [actionPending, startActionTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Build enriched rows
  const rows: PurchaseRow[] = useMemo(() => {
    return purchases
      .filter((p) => p.paymentStatus !== "refunded")
      .map((p) => {
        const isStudent = !!p.studentId;
        const info = p.studentId ? studentInfoMap[p.studentId] : null;
        const prod = productMap.get(p.eventProductId);
        return {
          purchase: p,
          personName: isStudent ? (info?.fullName ?? "Unknown student") : (p.guestName ?? "Guest"),
          personEmail: isStudent ? (info?.email ?? "") : (p.guestEmail ?? ""),
          personType: isStudent ? "student" as const : "guest" as const,
          productName: p.productNameSnapshot ?? prod?.name ?? "Unknown",
          productType: p.productTypeSnapshot ?? prod?.productType ?? "other",
        };
      });
  }, [purchases, studentInfoMap, productMap]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.personName.toLowerCase().includes(q) ||
        r.personEmail.toLowerCase().includes(q),
      );
    }
    if (filterPayment !== "all") result = result.filter((r) => r.purchase.paymentStatus === filterPayment);
    if (filterCheckIn === "checked_in") result = result.filter((r) => !!r.purchase.checkedInAt);
    else if (filterCheckIn === "not_checked_in") result = result.filter((r) => !r.purchase.checkedInAt);
    if (filterPerson !== "all") result = result.filter((r) => r.personType === filterPerson);
    if (filterProduct !== "all") result = result.filter((r) => r.purchase.eventProductId === filterProduct);
    return result;
  }, [rows, search, filterPayment, filterCheckIn, filterPerson, filterProduct]);

  // Stats
  const stats = useMemo(() => ({
    total: rows.length,
    paid: rows.filter((r) => r.purchase.paymentStatus === "paid").length,
    pending: rows.filter((r) => r.purchase.paymentStatus === "pending").length,
    checkedIn: rows.filter((r) => !!r.purchase.checkedInAt).length,
    students: rows.filter((r) => r.personType === "student").length,
    guests: rows.filter((r) => r.personType === "guest").length,
  }), [rows]);

  // Actions
  const showSuccess = useCallback((msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  }, []);

  const handleCheckIn = useCallback((purchaseId: string) => {
    setActionError(null);
    setActionSuccess(null);
    startActionTransition(async () => {
      const result = await eventCheckInAction(purchaseId, event.id);
      if (result.success) showSuccess("Checked in");
      else setActionError(result.error ?? "Failed");
    });
  }, [event.id, showSuccess]);

  const handleUndoCheckIn = useCallback((purchaseId: string) => {
    setActionError(null);
    setActionSuccess(null);
    startActionTransition(async () => {
      const result = await eventUndoCheckInAction(purchaseId, event.id);
      if (result.success) showSuccess("Check-in removed");
      else setActionError(result.error ?? "Failed");
    });
  }, [event.id, showSuccess]);

  const handleCollectPaymentAndCheckIn = useCallback((purchaseId: string, method: "cash" | "revolut") => {
    setActionError(null);
    setActionSuccess(null);
    startActionTransition(async () => {
      const result = await eventCollectPaymentAndCheckInAction({
        purchaseId,
        eventId: event.id,
        receptionMethod: method,
      });
      if (result.success) {
        showSuccess("Payment collected & checked in");
      } else {
        setActionError(result.error ?? "Failed");
      }
    });
  }, [event.id, showSuccess]);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href={`/events/${event.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <PageHeader
            title="Reception Mode"
            description={event.title}
          />
        </div>
      </div>

      {/* ── Event window banner ───────────────────────────── */}
      {!isLive && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          isBefore ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
        }`}>
          <Lock className={`h-5 w-5 flex-shrink-0 ${isBefore ? "text-amber-500" : "text-gray-400"}`} />
          <div>
            <p className={`text-sm font-medium ${isBefore ? "text-amber-800" : "text-gray-600"}`}>
              {isBefore ? "Event has not started yet" : "Event has ended"}
            </p>
            <p className={`text-xs ${isBefore ? "text-amber-600" : "text-gray-500"}`}>
              {isBefore
                ? `Check-in will be available from ${formatEventDateRange(event.startDate, event.endDate)}`
                : "Check-in is no longer available. This view is read-only."}
            </p>
          </div>
        </div>
      )}

      {/* ── Stats Bar ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatPill label="Total" value={stats.total} />
        <StatPill label="Paid" value={stats.paid} color="green" />
        <StatPill label="Pending" value={stats.pending} color="amber" />
        <StatPill label="Checked in" value={stats.checkedIn} color="blue" />
        <StatPill label="Students" value={stats.students} />
        <StatPill label="Guests" value={stats.guests} />
      </div>

      {/* ── Scanning notice ───────────────────────────────── */}
      {isLive && (
        <div className="rounded-xl border border-bpm-200 bg-bpm-50/60 px-4 py-3 flex items-start gap-3 text-sm">
          <Info className="h-4 w-4 text-bpm-600 mt-0.5 flex-shrink-0" />
          <p className="text-bpm-800">
            QR scanning now runs from the global reception flow: open <span className="font-mono text-xs rounded bg-white px-1.5 py-0.5 border border-bpm-200">/scan</span> on your phone while signed in with the same admin account to check guests in. This page handles manual check-in, payment collection, and stats.
          </p>
        </div>
      )}

      {/* ── Action feedback ───────────────────────────────── */}
      {actionSuccess && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-800">{actionSuccess}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* ── Search + Filters ──────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-bpm-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-bpm-300"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Payment" value={filterPayment} onChange={(v) => setFilterPayment(v as FilterPayment)} options={[
            { value: "all", label: "All" }, { value: "paid", label: "Paid" }, { value: "pending", label: "Pending" },
          ]} />
          <FilterSelect label="Check-in" value={filterCheckIn} onChange={(v) => setFilterCheckIn(v as FilterCheckIn)} options={[
            { value: "all", label: "All" }, { value: "checked_in", label: "Checked in" }, { value: "not_checked_in", label: "Not checked in" },
          ]} />
          <FilterSelect label="Type" value={filterPerson} onChange={(v) => setFilterPerson(v as FilterPerson)} options={[
            { value: "all", label: "All" }, { value: "student", label: "Student" }, { value: "guest", label: "Guest" },
          ]} />
          <FilterSelect label="Product" value={filterProduct} onChange={(v) => setFilterProduct(v)} options={[
            { value: "all", label: "All products" },
            ...products.map((p) => ({ value: p.id, label: p.name })),
          ]} />
        </div>

        <p className="text-xs text-gray-400">
          Showing {filtered.length} of {rows.length} purchases
        </p>
      </div>

      {/* ── Purchase List ─────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No purchases match your filters
          </div>
        ) : (
          filtered.map((row) => (
            <PurchaseCard
              key={row.purchase.id}
              row={row}
              isLive={isLive}
              onCheckIn={handleCheckIn}
              onUndoCheckIn={handleUndoCheckIn}
              onCollectPaymentAndCheckIn={handleCollectPaymentAndCheckIn}
              actionPending={actionPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color?: "green" | "amber" | "blue" }) {
  const colorCls = color === "green" ? "text-green-700 bg-green-50 border-green-200"
    : color === "amber" ? "text-amber-700 bg-amber-50 border-amber-200"
    : color === "blue" ? "text-blue-700 bg-blue-50 border-blue-200"
    : "text-gray-700 bg-gray-50 border-gray-200";
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${colorCls}`}>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:border-bpm-300 focus:outline-none focus:ring-1 focus:ring-bpm-300"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{label}: {o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
    </div>
  );
}

function PurchaseCard({ row, isLive, onCheckIn, onUndoCheckIn, onCollectPaymentAndCheckIn, actionPending }: {
  row: PurchaseRow;
  isLive: boolean;
  onCheckIn: (id: string) => void;
  onUndoCheckIn: (id: string) => void;
  onCollectPaymentAndCheckIn: (id: string, method: "cash" | "revolut") => void;
  actionPending: boolean;
}) {
  const p = row.purchase;
  const isCheckedIn = !!p.checkedInAt;
  const isPaid = p.paymentStatus === "paid";
  const isPending = p.paymentStatus === "pending";
  const [showPayOpts, setShowPayOpts] = useState(false);

  return (
    <div className={`rounded-xl border bg-white p-4 flex items-center gap-4 ${
      isCheckedIn ? "border-green-200 bg-green-50/30" : isPending ? "border-amber-200" : "border-gray-200"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-medium text-gray-900 truncate">{row.personName}</p>
          <Badge variant={row.personType === "student" ? "info" : "default"} className="text-[10px] flex-shrink-0">
            {row.personType === "student" ? "Student" : "Guest"}
          </Badge>
        </div>
        <p className="text-xs text-gray-500 truncate">{row.personEmail}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">
            {PRODUCT_TYPE_LABELS[row.productType] ?? row.productType}: {row.productName}
          </span>
          {p.originalAmountCents != null && (
            <span className="text-xs text-gray-400">· {centsToEuros(p.originalAmountCents)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <Badge variant={isPaid ? "success" : isPending ? "warning" : "danger"}>
          {isPaid ? "Paid" : isPending ? "Pending" : p.paymentStatus}
        </Badge>
        {isCheckedIn ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Checked in
          </Badge>
        ) : (
          <Badge variant="neutral" className="gap-1">
            <Clock className="h-3 w-3" /> Not checked in
          </Badge>
        )}
      </div>

      <div className="flex-shrink-0">
        {!isLive ? (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Lock className="h-3 w-3" /> Read-only
          </div>
        ) : isCheckedIn ? (
          <button
            onClick={() => onUndoCheckIn(p.id)}
            disabled={actionPending}
            className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Undo
          </button>
        ) : isPaid ? (
          <button
            onClick={() => onCheckIn(p.id)}
            disabled={actionPending}
            className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3 w-3" /> Check in
          </button>
        ) : isPending ? (
          <div className="space-y-1">
            {!showPayOpts ? (
              <button
                onClick={() => setShowPayOpts(true)}
                disabled={actionPending}
                className="flex items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <Banknote className="h-3 w-3" /> Collect & check in
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={() => { onCollectPaymentAndCheckIn(p.id, "cash"); setShowPayOpts(false); }}
                  disabled={actionPending}
                  className="rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Cash
                </button>
                <button
                  onClick={() => { onCollectPaymentAndCheckIn(p.id, "revolut"); setShowPayOpts(false); }}
                  disabled={actionPending}
                  className="rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Revolut
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <XCircle className="h-3 w-3" /> N/A
          </div>
        )}
      </div>
    </div>
  );
}

function QrPurchaseCard({ info, onCheckIn, onUndoCheckIn, onCollectPaymentAndCheckIn, actionPending }: {
  info: EventQrPurchaseInfo;
  onCheckIn: (id: string) => void;
  onUndoCheckIn: (id: string) => void;
  onCollectPaymentAndCheckIn: (id: string, method: "cash" | "revolut") => void;
  actionPending: boolean;
}) {
  const [showPayOpts, setShowPayOpts] = useState(false);

  const statusConfig: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
    auto_checked_in: { color: "text-green-800", bg: "bg-green-100", border: "border-green-300", icon: <CheckCircle2 className="h-6 w-6 text-green-600" />, label: "Entry confirmed" },
    valid: { color: "text-green-800", bg: "bg-green-50", border: "border-green-200", icon: <CheckCircle2 className="h-5 w-5 text-green-600" />, label: "Valid for entry" },
    pending_payment: { color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200", icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, label: "Payment pending" },
    already_checked_in: { color: "text-blue-800", bg: "bg-blue-50", border: "border-blue-200", icon: <CheckCircle2 className="h-5 w-5 text-blue-500" />, label: "Already checked in" },
    refunded: { color: "text-red-800", bg: "bg-red-50", border: "border-red-200", icon: <XCircle className="h-5 w-5 text-red-500" />, label: "Refunded — not valid" },
    invalid: { color: "text-gray-800", bg: "bg-gray-50", border: "border-gray-200", icon: <XCircle className="h-5 w-5 text-gray-500" />, label: "Not valid" },
  };

  const cfg = statusConfig[info.entryStatus] ?? statusConfig.invalid;
  const isAutoCheckedIn = info.entryStatus === "auto_checked_in";

  return (
    <div className={`rounded-lg border-2 ${isAutoCheckedIn ? "border-green-400" : ""} ${cfg.border} ${cfg.bg} p-4 space-y-2`}>
      <div className="flex items-start gap-3">
        {isAutoCheckedIn ? (
          <div className="rounded-full bg-green-200 p-1.5">
            <CheckCircle2 className="h-6 w-6 text-green-700" />
          </div>
        ) : cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${isAutoCheckedIn ? "text-green-900 text-lg" : cfg.color}`}>{cfg.label}</p>
          <p className="text-sm text-gray-700 mt-0.5">
            {PRODUCT_TYPE_LABELS[info.productType] ?? info.productType}: {info.productName}
          </p>
          {info.originalAmountCents != null && (
            <p className="text-xs text-gray-500 mt-0.5">{centsToEuros(info.originalAmountCents)}</p>
          )}
        </div>
      </div>

      {info.entryStatus === "valid" && (
        <button
          onClick={() => onCheckIn(info.purchaseId)}
          disabled={actionPending}
          className="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Check in now
        </button>
      )}

      {info.entryStatus === "pending_payment" && (
        <div className="space-y-2">
          <p className="text-xs text-amber-700">
            {info.originalAmountCents != null
              ? `Collect ${centsToEuros(info.originalAmountCents)} before granting entry`
              : "Collect payment before granting entry"}
          </p>
          {!showPayOpts ? (
            <button
              onClick={() => setShowPayOpts(true)}
              disabled={actionPending}
              className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Banknote className="h-4 w-4" /> Collect payment & check in
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { onCollectPaymentAndCheckIn(info.purchaseId, "cash"); setShowPayOpts(false); }}
                disabled={actionPending}
                className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Cash
              </button>
              <button
                onClick={() => { onCollectPaymentAndCheckIn(info.purchaseId, "revolut"); setShowPayOpts(false); }}
                disabled={actionPending}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Revolut
              </button>
              <button
                onClick={() => setShowPayOpts(false)}
                disabled={actionPending}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {info.entryStatus === "already_checked_in" && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-blue-600">
            Checked in {info.checkedInAt ? new Date(info.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </p>
          <button
            onClick={() => onUndoCheckIn(info.purchaseId)}
            disabled={actionPending}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Undo
          </button>
        </div>
      )}
    </div>
  );
}
