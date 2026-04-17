"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Star,
  Eye,
  EyeOff,
  ShoppingCart,
  CalendarDays,
  Package,
  Ticket,
  Megaphone,
  LayoutDashboard,
  Globe,
  ExternalLink,
  Copy,
  Check,
  BarChart3,
  Users,
  User,
  QrCode,
  AlertTriangle,
  Ban,
  CircleAlert,
  ScanLine,
  Mail,
  Send,
  Undo2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  EventFormDialog,
  SessionFormDialog,
  EventProductFormDialog,
  ConfirmDeleteDialog,
} from "./event-dialogs";
import { EventAnnouncementDialog } from "./event-announcement-dialog";
import { markEventPurchasePaidAction, refundEventPurchaseAction } from "@/lib/actions/event-purchase";
import { resendEventPurchaseEmailAction, sendEventReminderAction } from "@/lib/actions/event-emails";
import {
  updateEventAction,
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  createEventProductAction,
  updateEventProductAction,
  deleteEventProductAction,
} from "@/lib/actions/special-events";
import type {
  MockSpecialEvent,
  MockEventSession,
  MockEventProduct,
  MockEventPurchase,
} from "@/lib/mock-data";

export interface StudentInfo {
  fullName: string;
  email: string;
}

interface Props {
  event: MockSpecialEvent;
  sessions: MockEventSession[];
  products: MockEventProduct[];
  purchases: MockEventPurchase[];
  studentInfoMap: Record<string, StudentInfo>;
}

import { formatEventDateRange, formatEventDT, formatSessionTimeRange } from "@/lib/utils";

function centsToEuros(c: number) {
  return `€${(c / 100).toFixed(2)}`;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  workshop: "Workshop",
  social: "Social",
  intensive: "Intensive",
  masterclass: "Masterclass",
  other: "Other",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  full_pass: "Full Pass",
  combo_pass: "Combo Pass",
  single_session: "Single Session",
  social_ticket: "Social Ticket",
  other: "Other",
};

const INCLUSION_LABELS: Record<string, string> = {
  all_sessions: "All sessions",
  selected_sessions: "Selected sessions",
  all_workshops: "All workshops",
  socials_only: "Socials only",
};

type CapacityState = "uncapped" | "available" | "near_capacity" | "full" | "oversold";

function getCapacityState(overallCapacity: number | null, totalSold: number): CapacityState {
  if (overallCapacity == null) return "uncapped";
  if (totalSold > overallCapacity) return "oversold";
  if (totalSold >= overallCapacity) return "full";
  if (totalSold / overallCapacity >= 0.8) return "near_capacity";
  return "available";
}

const CAPACITY_CONFIG: Record<CapacityState, { label: string; icon: typeof Check; className: string; bg: string; border: string; text: string }> = {
  uncapped: { label: "No global limit", icon: Check, className: "text-gray-500", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600" },
  available: { label: "Available", icon: Check, className: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  near_capacity: { label: "Near capacity", icon: CircleAlert, className: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  full: { label: "Full", icon: Ban, className: "text-red-600", bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  oversold: { label: "Oversold", icon: AlertTriangle, className: "text-red-700", bg: "bg-red-100", border: "border-red-300", text: "text-red-800" },
};

export function AdminEventDetail({ event, sessions, products, purchases, studentInfoMap }: Props) {
  const router = useRouter();

  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isPublicReady = event.isPublic && event.status === "published";
  const publicPath = `/event/${event.id}`;

  function copyPublicLink() {
    const absoluteUrl = new URL(publicPath, window.location.origin).toString();
    navigator.clipboard.writeText(absoluteUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const [showAddSession, setShowAddSession] = useState(false);
  const [editSession, setEditSession] = useState<MockEventSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<MockEventSession | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<MockEventProduct | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<MockEventProduct | null>(null);

  const studentList = Object.entries(studentInfoMap).map(([id, info]) => ({ id, fullName: info.fullName }));

  const [payPurchase, setPayPurchase] = useState<MockEventPurchase | null>(null);
  const [payMethod, setPayMethod] = useState<"cash" | "revolut">("cash");
  const [payPending, startPayTransition] = useTransition();
  const [payError, setPayError] = useState<string | null>(null);

  const [refundPurchase, setRefundPurchase] = useState<MockEventPurchase | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundPending, startRefundTransition] = useTransition();
  const [refundError, setRefundError] = useState<string | null>(null);

  const [emailPending, startEmailTransition] = useTransition();
  const [emailFeedback, setEmailFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [reminderPending, startReminderTransition] = useTransition();
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);

  function handleResendEmail(purchaseId: string, buyerEmail?: string | null) {
    setEmailFeedback(null);
    startEmailTransition(async () => {
      try {
        const res = await resendEventPurchaseEmailAction({
          purchaseId,
          eventId: event.id,
          buyerEmail: buyerEmail ?? undefined,
        });
        const msg = res.success
          ? res.trackingFailed ? "Sent (tracking update failed)" : "Email sent"
          : (res.error ?? "Failed");
        setEmailFeedback({ id: purchaseId, ok: res.success, msg });
        if (res.success) router.refresh();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unexpected error";
        setEmailFeedback({ id: purchaseId, ok: false, msg: errMsg });
      }
      setTimeout(() => setEmailFeedback(null), 5000);
    });
  }

  function handleSendReminder() {
    setReminderFeedback(null);
    startReminderTransition(async () => {
      const res = await sendEventReminderAction({ eventId: event.id });
      if (res.success) {
        setReminderFeedback(`Sent ${res.sentCount ?? 0} reminder${(res.sentCount ?? 0) !== 1 ? "s" : ""}${res.failedCount ? ` (${res.failedCount} failed)` : ""}`);
        router.refresh();
      } else {
        setReminderFeedback(res.error ?? "Failed");
      }
      setTimeout(() => setReminderFeedback(null), 5000);
    });
  }

  // ── Sales stats ──────────────────────────────────────────
  const activePurchases = purchases.filter((p) => p.paymentStatus !== "refunded");
  const totalSold = activePurchases.length;
  const totalPaid = activePurchases.filter((p) => p.paymentStatus === "paid").length;
  const totalPending = activePurchases.filter((p) => p.paymentStatus === "pending").length;
  const pendingCount = totalPending;
  const remaining = event.overallCapacity != null ? event.overallCapacity - totalSold : null;
  const rawPct = event.overallCapacity && event.overallCapacity > 0 ? Math.round((totalSold / event.overallCapacity) * 100) : null;
  const capacityPct = rawPct !== null ? Math.min(rawPct, 100) : null;
  const capacityState = getCapacityState(event.overallCapacity, totalSold);
  const capCfg = CAPACITY_CONFIG[capacityState];

  const productFallback = (p: MockEventPurchase) =>
    products.find((pr) => pr.id === p.eventProductId)?.priceCents ?? 0;

  const snapshotPaid = (p: MockEventPurchase): number =>
    p.paidAmountCents != null ? p.paidAmountCents
      : p.originalAmountCents != null ? p.originalAmountCents - (p.discountAmountCents ?? 0)
      : p.unitPriceCentsAtPurchase ?? productFallback(p);

  const snapshotOwed = (p: MockEventPurchase): number =>
    p.originalAmountCents != null ? p.originalAmountCents - (p.discountAmountCents ?? 0)
      : p.unitPriceCentsAtPurchase ?? productFallback(p);

  const paidRevenue = activePurchases
    .filter((p) => p.paymentStatus === "paid")
    .reduce((sum, p) => sum + snapshotPaid(p), 0);
  const pendingRevenue = activePurchases
    .filter((p) => p.paymentStatus === "pending")
    .reduce((sum, p) => sum + snapshotOwed(p), 0);

  const productBreakdown = products.map((p) => {
    const pPurchases = activePurchases.filter((pur) => pur.eventProductId === p.id);
    const paidPurchases = pPurchases.filter((pur) => pur.paymentStatus === "paid");
    const pendPurchases = pPurchases.filter((pur) => pur.paymentStatus === "pending");
    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      priceCents: p.priceCents,
      total: pPurchases.length,
      paid: paidPurchases.length,
      pending: pendPurchases.length,
      paidRevenue: paidPurchases.reduce((s, pur) => s + snapshotPaid(pur), 0),
      pendingRevenue: pendPurchases.reduce((s, pur) => s + snapshotOwed(pur), 0),
    };
  });

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href="/events" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <PageHeader
            title={event.title}
            description={event.subtitle ?? undefined}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {isPublicReady && (
                  <>
                    <a
                      href={publicPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open public page
                    </a>
                    <button
                      onClick={copyPublicLink}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {linkCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {linkCopied ? "Copied!" : "Copy link"}
                    </button>
                  </>
                )}
                <Link
                  href={`/events/${event.id}/operations`}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <ScanLine className="h-3.5 w-3.5" /> Reception mode
                </Link>
                <button
                  onClick={() => setShowAnnouncement(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-bpm-600 px-3 py-2 text-sm font-medium text-white hover:bg-bpm-700"
                >
                  <Megaphone className="h-3.5 w-3.5" /> Promote
                </button>
                <button
                  onClick={() => setShowEditEvent(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* ── Event Overview Card ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className={event.coverImageUrl ? "flex flex-col sm:flex-row" : ""}>
          {event.coverImageUrl && (
            <div className="sm:w-56 md:w-64 shrink-0 bg-gray-50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.coverImageUrl}
                alt={event.title}
                className="w-full h-auto block"
              />
            </div>
          )}
          <div className="p-5 space-y-3 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={event.status} />
              {event.isFeatured && <Badge variant="warning"><Star className="h-3 w-3 mr-0.5 fill-current" /> Featured in listings</Badge>}
              {event.isVisible ? <Badge variant="success"><Eye className="h-3 w-3 mr-0.5" /> Visible</Badge> : <Badge variant="default"><EyeOff className="h-3 w-3 mr-0.5" /> Hidden</Badge>}
              {event.salesOpen && <Badge variant="success"><ShoppingCart className="h-3 w-3 mr-0.5" /> Sales open</Badge>}
              {event.featuredOnDashboard && <Badge variant="info"><LayoutDashboard className="h-3 w-3 mr-0.5" /> On student dashboard</Badge>}
              {event.isPublic && <Badge variant="info"><Globe className="h-3 w-3 mr-0.5" /> Public</Badge>}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">When:</span> {formatEventDateRange(event.startDate, event.endDate)}</div>
              <div><span className="text-gray-500">Location:</span> {event.location || "—"}</div>
            </div>
            {event.description && <p className="text-sm text-gray-600">{event.description}</p>}
            {isPublicReady && (
              <div className="flex items-center gap-2 rounded-lg border border-bpm-100 bg-bpm-50/50 px-3 py-2">
                <Globe className="h-3.5 w-3.5 text-bpm-600 shrink-0" />
                <code className="text-xs text-gray-600 truncate flex-1">{publicPath}</code>
                <button onClick={copyPublicLink} className="text-xs font-medium text-bpm-600 hover:underline shrink-0">
                  {linkCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sales & Capacity ─────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-gray-400" /> Sales &amp; Capacity
        </h2>

        {/* Capacity state banner */}
        {capacityState !== "uncapped" && capacityState !== "available" && (
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${capCfg.bg} ${capCfg.border}`}>
            <capCfg.icon className={`h-5 w-5 shrink-0 ${capCfg.className}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${capCfg.text}`}>
                {capacityState === "oversold"
                  ? `Oversold — ${totalSold} sold vs ${event.overallCapacity} capacity`
                  : capacityState === "full"
                    ? "This event is fully booked. New purchases are blocked."
                    : `Near capacity — ${remaining} spot${remaining !== 1 ? "s" : ""} remaining`}
              </p>
              {capacityState === "oversold" && (
                <p className="text-xs text-red-600 mt-0.5">
                  Capacity was reduced below current sales. No one is auto-cancelled, but new purchases are blocked.
                </p>
              )}
            </div>
          </div>
        )}

        {/* High-level stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatBox label="Total sold" value={String(totalSold)} />
          <StatBox label="Paid" value={String(totalPaid)} color="text-green-600" />
          <StatBox label="Pending" value={String(totalPending)} color={totalPending > 0 ? "text-amber-600" : undefined} />
          {event.overallCapacity != null ? (
            <StatBox
              label="Remaining"
              value={String(Math.max(0, remaining ?? 0))}
              color={remaining != null && remaining <= 0 ? "text-red-600" : undefined}
            />
          ) : (
            <StatBox label="Capacity" value="No limit" small />
          )}
          <StatBox label="Revenue (paid)" value={centsToEuros(paidRevenue)} color="text-green-600" />
          {pendingRevenue > 0 ? (
            <StatBox label="Revenue (pending)" value={centsToEuros(pendingRevenue)} color="text-amber-600" />
          ) : (
            <StatBox label="Revenue (pending)" value={centsToEuros(0)} />
          )}
        </div>

        {/* Capacity progress bar */}
        {event.overallCapacity != null && capacityPct != null && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">
                  {totalSold} / {event.overallCapacity} sold
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${capCfg.bg} ${capCfg.text} ${capCfg.border} border`}>
                  <capCfg.icon className="h-3 w-3" />
                  {capCfg.label}
                </span>
              </div>
              <span className="text-gray-500 tabular-nums">{rawPct}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capacityState === "oversold" || capacityState === "full" ? "bg-red-500" : capacityState === "near_capacity" ? "bg-amber-500" : "bg-bpm-500"
                }`}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Uncapped indicator */}
        {event.overallCapacity == null && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            <Check className="h-4 w-4 text-gray-400" />
            No overall capacity limit set. Purchases are not capped. Set a limit via the Edit button if needed.
          </div>
        )}

        {/* Product breakdown */}
        {productBreakdown.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Sales by product</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-medium">Product</th>
                    <th className="text-right px-4 py-2 font-medium">Sold</th>
                    <th className="text-right px-4 py-2 font-medium">Paid</th>
                    <th className="text-right px-4 py-2 font-medium">Pending</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue (paid)</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue (pending)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {productBreakdown.map((pb) => {
                    const avgSnapshotCents = pb.total > 0
                      ? Math.round((pb.paidRevenue + pb.pendingRevenue) / pb.total)
                      : pb.priceCents;
                    const priceChanged = pb.total > 0 && avgSnapshotCents !== pb.priceCents;
                    return (
                    <tr key={pb.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{pb.name}</p>
                        <p className="text-xs text-gray-400">
                          {PRODUCT_TYPE_LABELS[pb.productType] ?? pb.productType}
                          {priceChanged
                            ? <> · purchased at {centsToEuros(avgSnapshotCents)} <span className="text-gray-300">(now {centsToEuros(pb.priceCents)})</span></>
                            : <> · {centsToEuros(pb.priceCents)} each</>}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-700 tabular-nums">{pb.total}</td>
                      <td className="px-4 py-2.5 text-right text-green-600 tabular-nums">{pb.paid}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600 tabular-nums">{pb.pending || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-700 tabular-nums">{centsToEuros(pb.paidRevenue)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600 tabular-nums">{pb.pendingRevenue > 0 ? centsToEuros(pb.pendingRevenue) : "—"}</td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-700">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{totalSold}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600 tabular-nums">{totalPaid}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-600 tabular-nums">{totalPending || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{centsToEuros(paidRevenue)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-600 tabular-nums">{pendingRevenue > 0 ? centsToEuros(pendingRevenue) : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Sessions ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Sessions ({sessions.length})</h2>
          <button
            onClick={() => setShowAddSession(true)}
            className="flex items-center gap-1.5 rounded-lg bg-bpm-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-bpm-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add Session
          </button>
        </div>

        {sessions.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No sessions yet" description="Add workshops, socials, or other sessions to this event." />
        ) : (
          <AdminTable headers={["Title", "Type", "Date & Time", "Teacher", "Room", "Capacity", ""]}>
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <Td className="font-medium">{s.title}</Td>
                <Td><StatusBadge status={s.sessionType} /></Td>
                <Td>{formatEventDT(s.date)}, {formatSessionTimeRange(s.date, s.startTime, s.endTime)}</Td>
                <Td>{s.teacherName || "—"}</Td>
                <Td>{s.room || "—"}</Td>
                <Td>{s.capacity ?? "—"}</Td>
                <Td>
                  <div className="flex gap-2">
                    <button onClick={() => setEditSession(s)} className="text-xs text-bpm-600 hover:underline">Edit</button>
                    <button onClick={() => setDeleteSession(s)} className="text-xs text-red-600 hover:underline">Delete</button>
                  </div>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      {/* ── Products ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Products ({products.length})</h2>
          <button
            onClick={() => setShowAddProduct(true)}
            className="flex items-center gap-1.5 rounded-lg bg-bpm-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-bpm-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add Product
          </button>
        </div>

        {products.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" description="Add purchasable products (passes, tickets) for this event." />
        ) : (
          <AdminTable headers={["Name", "Type", "Price", "Inclusion", "Visible", "Sales", ""]}>
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <Td className="font-medium">{p.name}</Td>
                <Td>{PRODUCT_TYPE_LABELS[p.productType] ?? p.productType}</Td>
                <Td>{centsToEuros(p.priceCents)}</Td>
                <Td>
                  {INCLUSION_LABELS[p.inclusionRule] ?? p.inclusionRule}
                  {p.inclusionRule === "selected_sessions" && p.includedSessionIds && (
                    <span className="ml-1 text-gray-400 text-xs">({p.includedSessionIds.length})</span>
                  )}
                </Td>
                <Td>{p.isVisible ? <Badge variant="success">Yes</Badge> : <Badge variant="default">No</Badge>}</Td>
                <Td>{p.salesOpen ? <Badge variant="success">Open</Badge> : <Badge variant="default">Closed</Badge>}</Td>
                <Td>
                  <div className="flex gap-2">
                    <button onClick={() => setEditProduct(p)} className="text-xs text-bpm-600 hover:underline">Edit</button>
                    <button onClick={() => setDeleteProduct(p)} className="text-xs text-red-600 hover:underline">Delete</button>
                  </div>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      {/* ── Purchases ───────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" /> Purchases ({activePurchases.length})
            </h2>
            <Badge variant="success">{totalPaid} paid</Badge>
            {pendingCount > 0 && (
              <Badge variant="warning">{pendingCount} pending</Badge>
            )}
            {event.overallCapacity != null && (
              <span className="text-xs text-gray-400">
                · counting toward {event.overallCapacity} capacity
              </span>
            )}
          </div>
          {activePurchases.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSendReminder}
                disabled={reminderPending}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Send className="h-3 w-3" /> {reminderPending ? "Sending…" : "Send reminder"}
              </button>
              {reminderFeedback && (
                <span className="text-xs text-gray-500">{reminderFeedback}</span>
              )}
            </div>
          )}
        </div>

        {purchases.length === 0 ? (
          <EmptyState icon={Ticket} title="No purchases yet" description="Purchases will appear here when students buy event products." />
        ) : (
          <AdminTable headers={["#", "Buyer", "Product", "Status", "QR", "Email", ""]}>
            {purchases.map((pur, idx) => {
              const product = products.find((p) => p.id === pur.eventProductId);
              const isGuest = !pur.studentId;
              const studentInfo = pur.studentId ? studentInfoMap[pur.studentId] : null;
              const isInternal = !!studentInfo;
              const buyerName = isGuest ? (pur.guestName ?? "Guest") : (studentInfo?.fullName ?? pur.studentId ?? "Unknown");
              const buyerEmail = isGuest ? pur.guestEmail : (studentInfo?.email ?? null);
              const isRefunded = pur.paymentStatus === "refunded";
              const canResend = !isRefunded && !!buyerEmail;
              const fb = emailFeedback?.id === pur.id ? emailFeedback : null;
              return (
                <tr key={pur.id} className={`hover:bg-gray-50 ${isRefunded ? "opacity-50" : ""}`}>
                  <Td>
                    <span className="text-xs text-gray-400 tabular-nums">{isRefunded ? "—" : idx + 1}</span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900 truncate">{buyerName}</span>
                          {isGuest ? (
                            <Badge variant="neutral">Guest</Badge>
                          ) : isInternal ? (
                            <Link
                              href={`/students?search=${encodeURIComponent(buyerName)}`}
                              className="inline-flex items-center gap-0.5 text-xs text-bpm-600 hover:underline shrink-0"
                              title="Open student profile"
                            >
                              <User className="h-3 w-3" /> Profile
                            </Link>
                          ) : (
                            <Badge variant="default">External</Badge>
                          )}
                        </div>
                        {buyerEmail && <p className="text-xs text-gray-400 truncate">{buyerEmail}</p>}
                      </div>
                    </div>
                  </Td>
                  <Td>{product?.name ?? pur.eventProductId}</Td>
                  <Td><StatusBadge status={pur.paymentStatus} /></Td>
                  <Td>
                    {isGuest ? (
                      pur.qrToken ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700" title={pur.qrToken}>
                          <QrCode className="h-3.5 w-3.5" /> Issued
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Pending</span>
                      )
                    ) : (
                      <span className="text-xs text-gray-400" title="Internal students use their student QR">Student QR</span>
                    )}
                  </Td>
                  <Td>
                    {pur.lastEmailSentAt ? (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${pur.lastEmailSuccess ? "text-green-700" : "text-red-600"}`}
                        title={`${pur.lastEmailType ?? "email"} — ${new Date(pur.lastEmailSentAt).toLocaleString("en-IE")}`}
                      >
                        <Mail className="h-3 w-3" />
                        {pur.lastEmailSuccess ? "Sent" : "Failed"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {pur.paymentStatus === "pending" && (
                        <button
                          onClick={() => { setPayPurchase(pur); setPayMethod("cash"); setPayError(null); }}
                          className="text-xs font-medium text-bpm-600 hover:underline"
                        >
                          Mark as paid
                        </button>
                      )}
                      {pur.paymentStatus === "paid" && (
                        <button
                          onClick={() => { setRefundPurchase(pur); setRefundReason(""); setRefundError(null); }}
                          className="text-xs font-medium text-red-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          <Undo2 className="h-3 w-3" /> Refund
                        </button>
                      )}
                      {canResend && (
                        <button
                          onClick={() => handleResendEmail(pur.id, buyerEmail)}
                          disabled={emailPending}
                          className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-50"
                          title={fb?.msg ?? "Resend confirmation email"}
                        >
                          {fb ? (fb.ok ? "Sent ✓" : `Failed`) : "Resend email"}
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </section>

      {/* ── Dialogs ─────────────────────────────────────────── */}
      <EventFormDialog
        open={showEditEvent}
        onClose={() => setShowEditEvent(false)}
        defaults={event}
        action={updateEventAction}
      />

      <SessionFormDialog
        open={showAddSession}
        onClose={() => setShowAddSession(false)}
        eventId={event.id}
        eventStartDate={event.startDate}
        eventEndDate={event.endDate}
        action={createSessionAction}
      />
      {editSession && (
        <SessionFormDialog
          open={!!editSession}
          onClose={() => setEditSession(null)}
          eventId={event.id}
          eventStartDate={event.startDate}
          eventEndDate={event.endDate}
          defaults={editSession}
          action={updateSessionAction}
        />
      )}
      {deleteSession && (
        <ConfirmDeleteDialog
          open={!!deleteSession}
          onClose={() => setDeleteSession(null)}
          title="Delete Session"
          message={`Delete "${deleteSession.title}"? This cannot be undone.`}
          onConfirm={async () => {
            await deleteSessionAction(deleteSession.id, event.id);
            setDeleteSession(null);
            router.refresh();
          }}
        />
      )}

      <EventProductFormDialog
        open={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        eventId={event.id}
        sessions={sessions}
        action={createEventProductAction}
      />
      {editProduct && (
        <EventProductFormDialog
          open={!!editProduct}
          onClose={() => setEditProduct(null)}
          eventId={event.id}
          sessions={sessions}
          defaults={editProduct}
          action={updateEventProductAction}
        />
      )}
      {deleteProduct && (
        <ConfirmDeleteDialog
          open={!!deleteProduct}
          onClose={() => setDeleteProduct(null)}
          title="Delete Product"
          message={`Delete "${deleteProduct.name}"? Existing purchases will remain but the product will no longer be available.`}
          onConfirm={async () => {
            await deleteEventProductAction(deleteProduct.id, event.id);
            setDeleteProduct(null);
            router.refresh();
          }}
        />
      )}

      <EventAnnouncementDialog
        open={showAnnouncement}
        onClose={() => setShowAnnouncement(false)}
        event={event}
        students={studentList}
      />

      {/* ── Mark as paid dialog ─────────────────────────────── */}
      {payPurchase && (
        <Dialog open={!!payPurchase} onClose={() => setPayPurchase(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Reception Payment</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-gray-600 mb-4">
                Confirm payment for <span className="font-medium">{payPurchase.studentId ? (studentInfoMap[payPurchase.studentId]?.fullName ?? payPurchase.studentId) : (payPurchase.guestName ?? "Guest")}</span>&apos;s purchase
                of <span className="font-medium">{products.find((p) => p.id === payPurchase.eventProductId)?.name ?? "product"}</span>.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment method received</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="receptionMethod" value="cash" checked={payMethod === "cash"} onChange={() => setPayMethod("cash")} className="accent-bpm-600" />
                    Cash
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="receptionMethod" value="revolut" checked={payMethod === "revolut"} onChange={() => setPayMethod("revolut")} className="accent-bpm-600" />
                    Revolut
                  </label>
                </div>
              </div>
              {payError && <p className="text-sm text-red-600 mt-2">{payError}</p>}
            </DialogBody>
            <DialogFooter>
              <button onClick={() => setPayPurchase(null)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50" disabled={payPending}>
                Cancel
              </button>
              <button
                disabled={payPending}
                onClick={() => {
                  startPayTransition(async () => {
                    const res = await markEventPurchasePaidAction({
                      purchaseId: payPurchase.id,
                      eventId: event.id,
                      receptionMethod: payMethod,
                    });
                    if (res.success) {
                      setPayPurchase(null);
                      router.refresh();
                    } else {
                      setPayError(res.error ?? "Failed to confirm payment");
                    }
                  });
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-bpm-600 text-white hover:bg-bpm-700 disabled:opacity-50"
              >
                {payPending ? "Confirming…" : "Confirm Payment"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Refund dialog ──────────────────────────────────────── */}
      {refundPurchase && (
        <Dialog open={!!refundPurchase} onClose={() => setRefundPurchase(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refund Event Purchase</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-gray-600 mb-2">
                Refund <span className="font-medium">{refundPurchase.studentId ? (studentInfoMap[refundPurchase.studentId]?.fullName ?? refundPurchase.studentId) : (refundPurchase.guestName ?? "Guest")}</span>&apos;s purchase
                of <span className="font-medium">{products.find((p) => p.id === refundPurchase.eventProductId)?.name ?? "product"}</span>?
              </p>
              <p className="text-sm font-semibold text-gray-800 mb-3">
                Amount: {centsToEuros(refundPurchase.paidAmountCents ?? refundPurchase.originalAmountCents ?? 0)}
              </p>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 mb-4">
                <strong>Warning:</strong> This purchase will no longer be valid for event entry or check-in. A refund confirmation email will be sent to the buyer.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason (optional)</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Event cancelled, duplicate purchase…"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-bpm-500"
                />
              </div>
              {refundError && <p className="text-sm text-red-600 mt-2">{refundError}</p>}
            </DialogBody>
            <DialogFooter>
              <button onClick={() => setRefundPurchase(null)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50" disabled={refundPending}>
                Cancel
              </button>
              <button
                disabled={refundPending}
                onClick={() => {
                  startRefundTransition(async () => {
                    const res = await refundEventPurchaseAction({
                      purchaseId: refundPurchase.id,
                      eventId: event.id,
                      refundReason: refundReason.trim() || null,
                    });
                    if (res.success) {
                      setRefundPurchase(null);
                      router.refresh();
                    } else {
                      setRefundError(res.error ?? "Failed to process refund");
                    }
                  });
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {refundPending ? "Processing…" : "Confirm Refund"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatBox({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 ${small ? "text-sm text-gray-400" : `text-xl font-bold ${color ?? "text-gray-900"}`}`}>{value}</p>
    </div>
  );
}
