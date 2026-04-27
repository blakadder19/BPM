"use client";

import { useState, useMemo, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign,
  Clock,
  RotateCcw,
  TrendingUp,
  Receipt,
  AlertTriangle,
  CreditCard,
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  FlaskConical,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, cn } from "@/lib/utils";
import {
  normalizeFinanceStatusLabel,
  FINANCE_STATUS_COLORS,
  type FinanceTransaction,
  type FinanceMetrics,
  type FinanceSource,
} from "@/lib/domain/finance";
import type { FinanceAuditEntry } from "@/lib/services/finance-audit-log";
import {
  type FinanceSuperAdminStatus,
  type FinanceTestCandidate,
  FINANCE_TEST_DELETE_CONFIRMATION,
} from "@/lib/domain/finance-admin";
import {
  deleteFinanceTestRecordsAction,
  listFinanceTestCandidatesAction,
  toggleFinanceTestMarkerAction,
} from "@/lib/actions/finance-admin";

// ── Props ────────────────────────────────────────────────────

interface FinanceClientProps {
  transactions: FinanceTransaction[];
  metrics: FinanceMetrics;
  auditLog?: FinanceAuditEntry[];
  superAdminStatus?: FinanceSuperAdminStatus | null;
}

// ── Helpers ──────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

const SOURCE_LABELS: Record<FinanceSource, string> = {
  subscription: "Subscription",
  event_purchase: "Event",
  penalty: "Penalty",
};

const METHOD_LABELS: Record<string, string> = {
  stripe: "Stripe",
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  revolut: "Revolut",
  manual: "Manual / Reception",
  complimentary: "Complimentary",
};

const STATUS_COLORS = FINANCE_STATUS_COLORS;

const TYPE_OPTIONS = [
  { value: "purchase", label: "Purchase" },
  { value: "refund", label: "Refund" },
  { value: "penalty", label: "Penalty" },
  { value: "complimentary", label: "Complimentary" },
];

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "waived", label: "Waived" },
  { value: "complimentary", label: "Complimentary" },
];

const SOURCE_OPTIONS = [
  { value: "subscription", label: "Subscription" },
  { value: "event_purchase", label: "Event" },
  { value: "penalty", label: "Penalty" },
];

// ── Date presets ─────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface DatePreset {
  label: string;
  from: string;
  to: string;
}

function getDatePresets(): DatePreset[] {
  const today = todayStr();
  return [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: daysAgoStr(6), to: today },
    { label: "This month", from: monthStartStr(), to: today },
    { label: "All time", from: "", to: "" },
  ];
}

// ── CSV export ──────────────────────────────────────────────

function exportToCsv(rows: FinanceTransaction[]) {
  const headers = [
    "Date", "Buyer", "Email", "Product", "Product Type",
    "Source", "Transaction Type", "Status", "Amount (EUR)",
    "Payment Method", "Reference", "Performed By",
    "Refunded At", "Refunded By", "Refund Reason",
  ];

  const escape = (v: string | null | undefined) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const csvRows = rows.map((tx) => [
    tx.date,
    tx.buyerName,
    tx.buyerEmail ?? "",
    tx.productName,
    tx.productType,
    SOURCE_LABELS[tx.source] ?? tx.source,
    tx.transactionType,
    normalizeFinanceStatusLabel(tx.status),
    (tx.amountCents / 100).toFixed(2),
    METHOD_LABELS[tx.paymentMethod ?? ""] ?? tx.paymentMethod ?? "",
    tx.reference ?? "",
    tx.performedBy ?? "",
    tx.refundedAt ?? "",
    tx.refundedBy ?? "",
    tx.refundReason ?? "",
  ].map(escape).join(","));

  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bpm-finance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ───────────────────────────────────────────────

export function FinanceClient({ transactions, metrics, auditLog = [], superAdminStatus }: FinanceClientProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canMarkTest = !!superAdminStatus?.canDelete;
  // Optimistic per-row override of `tx.isTest` after a successful toggle, so
  // the UI updates immediately without waiting for the next router refresh.
  const [testOverride, setTestOverride] = useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Bumped after a successful toggle so the danger zone re-fetches candidates
  // when it is currently expanded.
  const [candidatesRefreshKey, setCandidatesRefreshKey] = useState(0);

  const datePresets = useMemo(() => getDatePresets(), []);

  const methodOptions = useMemo(() => {
    const methods = new Set(
      transactions.map((t) => t.paymentMethod).filter(Boolean) as string[],
    );
    return [...methods].sort().map((m) => ({
      value: m,
      label: METHOD_LABELS[m] ?? m,
    }));
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter((tx) => {
      if (q
        && !tx.buyerName.toLowerCase().includes(q)
        && !tx.productName.toLowerCase().includes(q)
        && !(tx.buyerEmail ?? "").toLowerCase().includes(q)
        && !(tx.reference ?? "").toLowerCase().includes(q)
      ) return false;
      if (typeFilter && tx.transactionType !== typeFilter) return false;
      if (statusFilter && tx.status !== statusFilter) return false;
      if (sourceFilter && tx.source !== sourceFilter) return false;
      if (methodFilter && tx.paymentMethod !== methodFilter) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [transactions, search, typeFilter, statusFilter, sourceFilter, methodFilter, dateFrom, dateTo]);

  const sortedMethodEntries = useMemo(
    () =>
      Object.entries(metrics.byMethod)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6),
    [metrics.byMethod],
  );

  function applyDatePreset(preset: DatePreset) {
    setDateFrom(preset.from);
    setDateTo(preset.to);
  }

  const activePresetLabel = useMemo(() => {
    const match = datePresets.find((p) => p.from === dateFrom && p.to === dateTo);
    return match?.label ?? null;
  }, [dateFrom, dateTo, datePresets]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Finance"
          description="Revenue overview, payments, and transaction history."
        />
        <AdminHelpButton pageKey="finance" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Paid Revenue"
          value={formatCents(metrics.totalPaidCents)}
          icon={DollarSign}
          accent="text-green-600"
          bg="bg-green-50"
        />
        <KpiCard
          label="Pending"
          value={formatCents(metrics.totalPendingCents)}
          icon={Clock}
          accent="text-amber-600"
          bg="bg-amber-50"
        />
        <KpiCard
          label="Refunded"
          value={formatCents(metrics.totalRefundedCents)}
          icon={RotateCcw}
          accent="text-red-600"
          bg="bg-red-50"
        />
        <KpiCard
          label="Net Revenue"
          value={formatCents(metrics.netRevenueCents)}
          icon={TrendingUp}
          accent="text-bpm-600"
          bg="bg-bpm-50"
        />
      </div>

      {/* Counts + method breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniCard label="Paid Tx" value={String(metrics.paidCount)} />
        <MiniCard label="Pending Tx" value={String(metrics.pendingCount)} />
        <MiniCard label="Refunds" value={String(metrics.refundCount)} />
        {sortedMethodEntries.map(([method, cents]) => (
          <MiniCard
            key={method}
            label={METHOD_LABELS[method] ?? method}
            value={formatCents(cents)}
          />
        ))}
      </div>

      {/* Revenue by source — Paid + Pending breakdown */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-2">
          Revenue by source
        </p>
        <div className="grid grid-cols-3 gap-3">
          <SourceCard
            source="subscription"
            label="Subscriptions"
            paidCents={metrics.bySource.subscription}
            pendingCents={metrics.pendingBySource.subscription}
          />
          <SourceCard
            source="event_purchase"
            label="Events"
            paidCents={metrics.bySource.event_purchase}
            pendingCents={metrics.pendingBySource.event_purchase}
          />
          <SourceCard
            source="penalty"
            label="Penalties"
            paidCents={metrics.bySource.penalty}
            pendingCents={metrics.pendingBySource.penalty}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Date presets row */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Quick:</span>
          {datePresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyDatePreset(preset)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activePresetLabel === preset.label
                  ? "bg-bpm-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search buyer, product, email or reference…"
            />
          </div>
          <SelectFilter value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="All types" />
          <SelectFilter value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="All statuses" />
          <SelectFilter value={sourceFilter} onChange={setSourceFilter} options={SOURCE_OPTIONS} placeholder="All sources" />
          <SelectFilter value={methodFilter} onChange={setMethodFilter} options={methodOptions} placeholder="All methods" />
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500"
            />
          </div>
          <button
            type="button"
            onClick={() => exportToCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {toggleError}
        </div>
      )}

      {/* Transaction table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions"
          description="No financial transactions match your filters."
        />
      ) : (
        <>
          <AdminTable
            headers={
              canMarkTest
                ? ["Date", "Buyer", "Product", "Source / Type", "Status", "Amount", "Method", "Reference", "By", "Test"]
                : ["Date", "Buyer", "Product", "Source / Type", "Status", "Amount", "Method", "Reference", "By"]
            }
            count={filtered.length}
          >
            {filtered.slice(0, 200).map((tx) => {
              const isMarked = testOverride[tx.id] ?? tx.isTest;
              return (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  superAdmin={canMarkTest}
                  isMarkedAsTest={isMarked}
                  isToggling={togglingId === tx.id}
                  onToggleTest={async () => {
                    setToggleError(null);
                    setTogglingId(tx.id);
                    try {
                      const result = await toggleFinanceTestMarkerAction({
                        transactionId: tx.id,
                        mark: !isMarked,
                      });
                      if (!result.success) {
                        setToggleError(result.error ?? "Toggle failed.");
                      } else {
                        setTestOverride((prev) => ({
                          ...prev,
                          [tx.id]: result.isMarked ?? !isMarked,
                        }));
                        setCandidatesRefreshKey((k) => k + 1);
                      }
                    } finally {
                      setTogglingId(null);
                    }
                  }}
                />
              );
            })}
          </AdminTable>
          {filtered.length > 200 && (
            <p className="text-xs text-gray-400 text-center pt-1">
              Showing first 200 of {filtered.length} transactions. Use filters to narrow results.
            </p>
          )}
        </>
      )}

      {/* Audit Trail */}
      {auditLog.length > 0 && <AuditTrailSection entries={auditLog} />}

      {/* Super-admin danger zone */}
      {superAdminStatus?.canDelete && <FinanceDangerZone refreshKey={candidatesRefreshKey} />}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  bg,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  accent: string;
  bg: string;
}) {
  return (
    <div className={cn("rounded-xl border border-gray-200 p-4 space-y-1", bg)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", accent)} />
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", accent)}>{value}</p>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function SourceCard({
  source,
  label,
  paidCents,
  pendingCents,
}: {
  source: FinanceSource;
  label: string;
  paidCents: number;
  pendingCents: number;
}) {
  const icons: Record<FinanceSource, typeof DollarSign> = {
    subscription: CreditCard,
    event_purchase: Receipt,
    penalty: AlertTriangle,
  };
  const Icon = icons[source];
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
      <Icon className="h-5 w-5 text-gray-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-800">{formatCents(paidCents)}<span className="text-[10px] font-normal text-gray-400 ml-1">paid</span></p>
        {pendingCents > 0 && (
          <p className="text-xs text-amber-600">{formatCents(pendingCents)}<span className="text-[10px] text-amber-500 ml-1">pending</span></p>
        )}
      </div>
    </div>
  );
}

function TxRow({
  tx,
  superAdmin = false,
  isMarkedAsTest = false,
  isToggling = false,
  onToggleTest,
}: {
  tx: FinanceTransaction;
  superAdmin?: boolean;
  isMarkedAsTest?: boolean;
  isToggling?: boolean;
  onToggleTest?: () => void;
}) {
  const statusColor = STATUS_COLORS[tx.status] ?? "bg-gray-100 text-gray-600";
  const dateStr = tx.date.includes("T") ? formatDate(tx.date.slice(0, 10)) : formatDate(tx.date);
  const refundInfo = tx.refundedAt || tx.refundReason
    ? [
        tx.refundedAt ? `Refunded ${formatDate(tx.refundedAt.slice(0, 10))}` : null,
        tx.refundedBy ? `by ${tx.refundedBy}` : null,
        tx.refundReason,
      ].filter(Boolean).join(" — ")
    : null;

  const isPending = tx.status === "pending";
  const isRefunded = tx.status === "refunded";
  const isPendingManual = isPending && (tx.paymentMethod === "manual" || tx.paymentMethod === "cash" || tx.paymentMethod === "bank_transfer");

  const rowClass = cn(
    isRefunded && "bg-red-50/40",
    isPendingManual && "bg-amber-50/40",
  );

  const buyerCell = tx.studentId ? (
    <Link
      href={`/students?search=${encodeURIComponent(tx.buyerName)}`}
      className="font-medium text-bpm-700 hover:text-bpm-900 hover:underline"
    >
      {tx.buyerName}
    </Link>
  ) : (
    <span className="font-medium text-gray-900">{tx.buyerName}</span>
  );

  return (
    <tr className={rowClass}>
      <Td>{dateStr}</Td>
      <Td className="max-w-[180px] truncate">{buyerCell}</Td>
      <Td className="max-w-[200px]">
        <div className="truncate">{tx.productName}</div>
        {refundInfo && (
          <div className="text-[10px] text-red-500 truncate" title={refundInfo}>{refundInfo}</div>
        )}
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
            {SOURCE_LABELS[tx.source]}
          </span>
          <span className="text-xs text-gray-500 capitalize">{tx.transactionType}</span>
        </div>
      </Td>
      <Td>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", statusColor)}>
          {normalizeFinanceStatusLabel(tx.status)}
        </span>
        {isPendingManual && (
          <span className="ml-1 text-[10px] text-amber-600 font-medium">Action needed</span>
        )}
      </Td>
      <Td className="font-medium tabular-nums">{formatCents(tx.amountCents)}</Td>
      <Td className="capitalize text-xs">{METHOD_LABELS[tx.paymentMethod ?? ""] ?? tx.paymentMethod ?? "—"}</Td>
      <Td className="max-w-[120px] truncate text-xs text-gray-400">{tx.reference ?? "—"}</Td>
      <Td className="text-xs text-gray-500">{tx.performedBy ?? "—"}</Td>
      {superAdmin && (
        <Td>
          <button
            type="button"
            onClick={onToggleTest}
            disabled={isToggling || !onToggleTest}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              isMarkedAsTest
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            )}
            title={
              isMarkedAsTest
                ? "Remove the [test] marker so this row no longer appears in the danger zone"
                : "Mark this row as test data so it can be deleted from the danger zone"
            }
          >
            {isToggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FlaskConical className="h-3 w-3" />
            )}
            {isMarkedAsTest ? "Unmark test" : "Mark as test"}
          </button>
        </Td>
      )}
    </tr>
  );
}

// ── Audit Trail ────────────────────────────────────────────

const AUDIT_ACTION_LABELS: Record<string, string> = {
  created: "Created",
  marked_paid: "Marked paid",
  marked_pending: "Marked pending",
  refunded: "Refunded",
  waived: "Waived",
  cancelled: "Cancelled",
  renewed: "Renewed",
  status_changed: "Status changed",
  manual_edit: "Manual edit",
};

const AUDIT_ACTION_COLORS: Record<string, string> = {
  created: "text-blue-600",
  marked_paid: "text-green-600",
  refunded: "text-red-600",
  waived: "text-gray-500",
  cancelled: "text-red-500",
  status_changed: "text-amber-600",
};

const ENTITY_LABELS: Record<string, string> = {
  subscription: "Subscription",
  event_purchase: "Event purchase",
  penalty: "Penalty",
};

function AuditTrailSection({ entries }: { entries: FinanceAuditEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Recent Activity</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {entries.length}
          </span>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-gray-400" />
          : <ChevronRight className="h-4 w-4 text-gray-400" />
        }
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-3">
          {entries.length === 0 ? (
            <p className="py-3 text-xs text-gray-400">No activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {entries.slice(0, 25).map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-2.5">
                  <div className="shrink-0 pt-0.5">
                    <span className={cn("text-xs font-medium", AUDIT_ACTION_COLORS[e.action] ?? "text-gray-600")}>
                      {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700">
                      <span className="font-medium">{ENTITY_LABELS[e.entityType] ?? e.entityType}</span>
                      {" "}
                      <span className="text-gray-400">{e.entityId}</span>
                      {e.previousValue && e.newValue && (
                        <span className="text-gray-400">
                          {" "}&mdash; {e.previousValue} &rarr; {e.newValue}
                        </span>
                      )}
                    </p>
                    {e.detail && (
                      <p className="text-[11px] text-gray-400 truncate max-w-md" title={e.detail}>
                        {e.detail}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-gray-400 whitespace-nowrap">
                      {formatAuditDate(e.createdAt)}
                    </p>
                    {e.performedBy && (
                      <p className="text-[10px] text-gray-400">by {e.performedBy}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {entries.length > 25 && (
            <p className="text-[11px] text-gray-400 pt-1">
              Showing latest 25 of {entries.length} events.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Finance Danger Zone (super-admin) ────────────────────────

function FinanceDangerZone({ refreshKey = 0 }: { refreshKey?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [candidates, setCandidates] = useState<FinanceTestCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoading, startLoadTransition] = useTransition();

  const loadCandidates = useCallback(() => {
    setLoadError(null);
    startLoadTransition(async () => {
      const r = await listFinanceTestCandidatesAction();
      if (r.success && r.candidates) {
        setCandidates(r.candidates);
        setSelectedIds(new Set());
      } else {
        setCandidates([]);
        setLoadError(r.error ?? "Failed to load candidates");
      }
    });
  }, []);

  useEffect(() => {
    if (expanded && candidates === null) loadCandidates();
  }, [expanded, candidates, loadCandidates]);

  // Reload when the parent signals a row was just (un)marked.
  useEffect(() => {
    if (expanded && refreshKey > 0) loadCandidates();
  }, [refreshKey, expanded, loadCandidates]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!candidates) return;
    if (selectedIds.size === candidates.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(candidates.map((c) => c.id)));
  }

  function handleDelete() {
    if (confirmation !== FINANCE_TEST_DELETE_CONFIRMATION) return;
    if (selectedIds.size === 0) return;
    setResult(null);
    startTransition(async () => {
      const r = await deleteFinanceTestRecordsAction({
        confirmation,
        ids: [...selectedIds],
      });
      if (r.success) {
        const parts = [
          `${r.deletedSubscriptions ?? 0} subscription(s)`,
          `${r.deletedPenalties ?? 0} penalty/ies`,
          `${r.deletedEventPurchases ?? 0} event purchase(s)`,
        ];
        let msg = `Deleted: ${parts.join(", ")}.`;
        if (r.skipped && r.skipped > 0) {
          msg += ` Skipped ${r.skipped}.`;
        }
        setResult(msg);
        setConfirmation("");
        setSelectedIds(new Set());
        loadCandidates();
      } else {
        setResult(`Error: ${r.error}`);
      }
    });
  }

  const canSubmit =
    !isPending &&
    confirmation === FINANCE_TEST_DELETE_CONFIRMATION &&
    selectedIds.size > 0;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-500" />
          <span className="text-sm font-semibold text-red-700">Danger Zone — Super Admin</span>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-red-400" />
          : <ChevronRight className="h-4 w-4 text-red-400" />
        }
      </button>

      {expanded && (
        <div className="border-t border-red-200 px-4 pb-4 pt-3 space-y-3">
          <div className="rounded-lg bg-white/60 border border-red-200 px-3 py-2 text-[11px] text-red-800 space-y-1">
            <p>
              Lists subscriptions, penalties, and event purchases whose{" "}
              <span className="font-mono">paymentNotes</span>,{" "}
              <span className="font-mono">notes</span>, <span className="font-mono">paymentReference</span>,
              or <span className="font-mono">refundReason</span> contain an explicit test marker:
              <span className="font-mono"> [test]</span>, <span className="font-mono">#test</span>, or{" "}
              <span className="font-mono">TEST:</span>.
            </p>
            <p>
              Records without a test marker are <strong>never</strong> deleted. Nothing is
              deleted without your explicit per-row selection. This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-red-700">
              Test candidates {candidates ? `(${candidates.length})` : ""}
            </p>
            <button
              type="button"
              onClick={loadCandidates}
              disabled={isLoading}
              className="text-xs text-red-700 hover:text-red-900 underline disabled:opacity-40"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loadError && (
            <p className="text-xs rounded bg-red-100 text-red-800 px-3 py-2">{loadError}</p>
          )}

          {candidates && candidates.length === 0 && !loadError && (
            <p className="text-xs text-red-600 italic">
              No records carry a test marker. Tag a record&apos;s notes with{" "}
              <span className="font-mono">[test]</span> to make it deletable here.
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-white max-h-64 overflow-y-auto">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-red-100 bg-red-50/50 sticky top-0">
                <input
                  type="checkbox"
                  checked={selectedIds.size === candidates.length && candidates.length > 0}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 accent-red-600"
                />
                <span className="text-[11px] font-medium text-red-700">
                  Select all ({selectedIds.size}/{candidates.length} selected)
                </span>
              </div>
              <ul className="divide-y divide-red-100">
                {candidates.map((c) => (
                  <li key={`${c.kind}:${c.id}`} className="px-3 py-2 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-3.5 w-3.5 accent-red-600 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
                          {c.kind === "event_purchase" ? "Event" : c.kind}
                        </span>
                        <span className="text-xs font-medium text-gray-900 truncate">{c.label}</span>
                      </div>
                      {c.detail && (
                        <p className="text-[11px] text-gray-500 truncate" title={c.detail}>
                          {c.detail}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 font-mono">{c.id}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-red-800 mb-1">
              Type <span className="font-mono font-bold">{FINANCE_TEST_DELETE_CONFIRMATION}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={FINANCE_TEST_DELETE_CONFIRMATION}
              className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-900 placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-400"
              disabled={isPending}
            />
          </div>

          <button
            type="button"
            onClick={handleDelete}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            {isPending
              ? "Deleting…"
              : selectedIds.size === 0
                ? "Delete selected"
                : `Delete ${selectedIds.size} selected`}
          </button>

          {result && (
            <p className={cn("text-xs rounded px-3 py-2", result.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800")}>
              {result}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatAuditDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })
      + " " + d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 16);
  }
}
