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
import { markEventPurchasePaidAction } from "@/lib/actions/event-purchase";
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

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

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

export function AdminEventDetail({ event, sessions, products, purchases, studentInfoMap }: Props) {
  const router = useRouter();

  // Event edit
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

  // Session dialogs
  const [showAddSession, setShowAddSession] = useState(false);
  const [editSession, setEditSession] = useState<MockEventSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<MockEventSession | null>(null);

  // Product dialogs
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<MockEventProduct | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<MockEventProduct | null>(null);

  const studentList = Object.entries(studentInfoMap).map(([id, info]) => ({ id, fullName: info.fullName }));

  // Mark-as-paid dialog
  const [payPurchase, setPayPurchase] = useState<MockEventPurchase | null>(null);
  const [payMethod, setPayMethod] = useState<"cash" | "revolut">("cash");
  const [payPending, startPayTransition] = useTransition();
  const [payError, setPayError] = useState<string | null>(null);

  // ── Sales stats ──────────────────────────────────────────
  const activePurchases = purchases.filter((p) => p.paymentStatus !== "refunded");
  const totalSold = activePurchases.length;
  const totalPaid = activePurchases.filter((p) => p.paymentStatus === "paid").length;
  const totalPending = activePurchases.filter((p) => p.paymentStatus === "pending").length;
  const pendingCount = totalPending;
  const remaining = event.overallCapacity != null ? Math.max(0, event.overallCapacity - totalSold) : null;
  const capacityPct = event.overallCapacity ? Math.min(100, Math.round((totalSold / event.overallCapacity) * 100)) : null;

  const productBreakdown = products.map((p) => {
    const pPurchases = activePurchases.filter((pur) => pur.eventProductId === p.id);
    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      total: pPurchases.length,
      paid: pPurchases.filter((pur) => pur.paymentStatus === "paid").length,
      pending: pPurchases.filter((pur) => pur.paymentStatus === "pending").length,
      revenue: pPurchases.filter((pur) => pur.paymentStatus === "paid").length * p.priceCents,
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
              <div><span className="text-gray-500">Dates:</span> {formatDate(event.startDate)} – {formatDate(event.endDate)}</div>
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

      {/* ── Sales Overview ─────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-gray-400" /> Sales Overview
        </h2>

        {/* High-level stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total sold</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalSold}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paid</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{totalPaid}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{totalPending}</p>
          </div>
          {event.overallCapacity != null ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remaining</p>
              <p className={`mt-1 text-2xl font-bold ${remaining === 0 ? "text-red-600" : "text-gray-900"}`}>{remaining}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Capacity</p>
              <p className="mt-1 text-sm text-gray-400">No limit set</p>
            </div>
          )}
        </div>

        {/* Capacity progress bar */}
        {event.overallCapacity != null && capacityPct != null && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-gray-700">
                {totalSold} / {event.overallCapacity} sold
              </span>
              <span className="text-gray-500">{capacityPct}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capacityPct >= 100 ? "bg-red-500" : capacityPct >= 80 ? "bg-amber-500" : "bg-bpm-500"
                }`}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Product breakdown */}
        {productBreakdown.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Sales by product</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {productBreakdown.map((pb) => (
                <div key={pb.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{pb.name}</p>
                    <p className="text-xs text-gray-400">{PRODUCT_TYPE_LABELS[pb.productType] ?? pb.productType}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <span className="text-gray-700 font-medium">{pb.total} sold</span>
                    <span className="text-green-600">{pb.paid} paid</span>
                    {pb.pending > 0 && <span className="text-amber-600">{pb.pending} pending</span>}
                    <span className="text-gray-500 font-medium">{centsToEuros(pb.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Total revenue (paid)</span>
              <span className="font-bold text-gray-900">{centsToEuros(productBreakdown.reduce((sum, pb) => sum + pb.revenue, 0))}</span>
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
                <Td>{formatDate(s.date)} {s.startTime}–{s.endTime}</Td>
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" /> Purchases ({purchases.length})
          </h2>
          {pendingCount > 0 && (
            <Badge variant="warning">{pendingCount} pending</Badge>
          )}
        </div>

        {purchases.length === 0 ? (
          <EmptyState icon={Ticket} title="No purchases yet" description="Purchases will appear here when students buy event products." />
        ) : (
          <AdminTable headers={["Buyer", "Product", "Method", "Status", "QR", "Date", ""]}>
            {purchases.map((pur) => {
              const product = products.find((p) => p.id === pur.eventProductId);
              const isGuest = !pur.studentId;
              const studentInfo = pur.studentId ? studentInfoMap[pur.studentId] : null;
              const isInternal = !!studentInfo;
              const buyerName = isGuest ? (pur.guestName ?? "Guest") : (studentInfo?.fullName ?? pur.studentId ?? "Unknown");
              const buyerEmail = isGuest ? pur.guestEmail : (studentInfo?.email ?? null);
              const methodLabel = pur.paymentMethod === "stripe"
                ? "Card (Stripe)"
                : pur.receptionMethod
                  ? `Reception (${pur.receptionMethod})`
                  : "Pay at reception";
              return (
                <tr key={pur.id} className="hover:bg-gray-50">
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
                  <Td>{methodLabel}</Td>
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
                  <Td>{new Date(pur.purchasedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</Td>
                  <Td>
                    {pur.paymentStatus === "pending" && (
                      <button
                        onClick={() => { setPayPurchase(pur); setPayMethod("cash"); setPayError(null); }}
                        className="text-xs font-medium text-bpm-600 hover:underline"
                      >
                        Mark as paid
                      </button>
                    )}
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
    </div>
  );
}
