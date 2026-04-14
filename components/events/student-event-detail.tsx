"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Users,
  Star,
  Ticket,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EventHero } from "./event-hero";
import { EventPurchaseDialog } from "./event-purchase-dialog";
import type {
  MockSpecialEvent,
  MockEventSession,
  MockEventProduct,
  MockEventPurchase,
} from "@/lib/mock-data";

interface Props {
  event: MockSpecialEvent;
  sessions: MockEventSession[];
  products: MockEventProduct[];
  myPurchases: MockEventPurchase[];
  stripeEnabled: boolean;
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
}

function formatShortDate(d: string) {
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
  other: "Session",
};

const SESSION_TYPE_COLORS: Record<string, string> = {
  workshop: "bg-blue-100 text-blue-700",
  social: "bg-purple-100 text-purple-700",
  intensive: "bg-orange-100 text-orange-700",
  masterclass: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

export function StudentEventDetail({ event, sessions, products, myPurchases, stripeEnabled }: Props) {
  const [purchaseProduct, setPurchaseProduct] = useState<MockEventProduct | null>(null);

  const activePurchases = myPurchases.filter((p) => p.paymentStatus !== "refunded");
  const purchasedProductIds = new Set(activePurchases.map((p) => p.eventProductId));

  const hasFullPass = activePurchases.some((pur) => {
    const prod = products.find((p) => p.id === pur.eventProductId);
    return prod?.productType === "full_pass";
  });

  const sessionsByDate = sessions.reduce<Record<string, MockEventSession[]>>((acc, s) => {
    (acc[s.date] ??= []).push(s);
    return acc;
  }, {});
  const sortedDates = Object.keys(sessionsByDate).sort();

  return (
    <div className="space-y-6">
      {/* ── Back Link ───────────────────────────────────────── */}
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All Events
      </Link>

      {/* ── Hero ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {!event.coverImageUrl && (
          <div className="h-3 bg-gradient-to-r from-bpm-500 via-bpm-coral to-bpm-400 rounded-t-xl" />
        )}
        <div className={event.coverImageUrl ? "flex flex-col sm:flex-row" : ""}>
          {event.coverImageUrl && (
            <div className="sm:w-64 md:w-72 shrink-0 bg-gray-50 overflow-hidden">
              <EventHero coverImageUrl={event.coverImageUrl} title={event.title} />
            </div>
          )}
          <div className="p-5 sm:p-6 space-y-3 flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900">{event.title}</h1>
                {event.subtitle && <p className="mt-1 text-lg text-gray-500">{event.subtitle}</p>}
              </div>
              {event.isFeatured && <Star className="h-5 w-5 text-amber-500 fill-amber-500 shrink-0 mt-1" />}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                {formatShortDate(event.startDate)} – {formatShortDate(event.endDate)}
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {event.location}
                </span>
              )}
            </div>
            {event.description && <p className="text-sm text-gray-600 leading-relaxed">{event.description}</p>}
          </div>
        </div>
      </div>

      {/* ── Schedule ────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">Schedule</h2>
          <div className="space-y-5">
            {sortedDates.map((date) => (
              <div key={date}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {formatDate(date)}
                </h3>
                <div className="space-y-2">
                  {sessionsByDate[date].map((s) => (
                    <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4 flex items-start gap-4">
                      <div className="shrink-0 text-center pt-0.5">
                        <div className="text-sm font-semibold text-gray-900">{s.startTime}</div>
                        <div className="text-xs text-gray-400">{s.endTime}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{s.title}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SESSION_TYPE_COLORS[s.sessionType] ?? SESSION_TYPE_COLORS.other}`}>
                            {SESSION_TYPE_LABELS[s.sessionType] ?? s.sessionType}
                          </span>
                        </div>
                        {s.teacherName && <p className="mt-0.5 text-sm text-gray-500">{s.teacherName}</p>}
                        {s.description && <p className="mt-1 text-sm text-gray-500">{s.description}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                          {s.room && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.room}</span>}
                          {s.capacity && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Capacity: {s.capacity}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Products / Tickets ──────────────────────────────── */}
      {products.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">Tickets & Passes</h2>
          {hasFullPass && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                You already own the Full Pass for this event. This pass includes all event access.
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {products.filter((p) => p.salesOpen || purchasedProductIds.has(p.id)).map((p) => {
              const purchased = purchasedProductIds.has(p.id);
              const blockedByFullPass = hasFullPass && !purchased;
              return (
                <div key={p.id} className={`rounded-xl border p-5 flex flex-col ${blockedByFullPass ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <span className="text-lg font-bold text-bpm-700 shrink-0">{centsToEuros(p.priceCents)}</span>
                  </div>
                  {p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>}
                  <div className="mt-auto pt-4">
                    {purchased ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm font-medium text-green-700 w-full justify-center">
                        <Check className="h-4 w-4" /> Purchased
                      </span>
                    ) : blockedByFullPass ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 w-full justify-center">
                        Included in Full Pass
                      </span>
                    ) : (
                      <button
                        onClick={() => setPurchaseProduct(p)}
                        className="w-full rounded-lg bg-bpm-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-bpm-700 transition-colors"
                      >
                        Purchase
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Purchase Dialog ─────────────────────────────────── */}
      {purchaseProduct && (
        <EventPurchaseDialog
          open={!!purchaseProduct}
          onClose={() => setPurchaseProduct(null)}
          product={purchaseProduct}
          sessions={sessions}
          stripeEnabled={stripeEnabled}
        />
      )}
    </div>
  );
}
