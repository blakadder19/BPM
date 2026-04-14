"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Users,
  Star,
  Ticket,
  ArrowRight,
  CreditCard,
  Banknote,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { EventHero } from "./event-hero";
import { createGuestEventPurchaseAction } from "@/lib/actions/event-purchase";
import { createGuestEventStripeCheckoutAction } from "@/lib/actions/stripe-checkout";
import type {
  MockSpecialEvent,
  MockEventSession,
  MockEventProduct,
} from "@/lib/mock-data";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

interface Props {
  event: MockSpecialEvent;
  sessions: MockEventSession[];
  products: MockEventProduct[];
  stripeEnabled: boolean;
  allowReceptionPayment: boolean;
  purchaseStatus?: "success" | "cancelled";
}

export function PublicEventPage({ event, sessions, products, stripeEnabled, allowReceptionPayment, purchaseStatus }: Props) {
  const sessionsByDate = sessions.reduce<Record<string, MockEventSession[]>>(
    (acc, s) => {
      (acc[s.date] ??= []).push(s);
      return acc;
    },
    {},
  );
  const sortedDates = Object.keys(sessionsByDate).sort();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="bg-zinc-900 text-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <span className="font-display text-lg font-semibold tracking-tight">
            BPM Dance Academy
          </span>
          <Link
            href="/login"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
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
            <div className="p-6 sm:p-8 space-y-4 flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900">
                    {event.title}
                  </h1>
                  {event.subtitle && (
                    <p className="mt-1 text-lg text-gray-500">{event.subtitle}</p>
                  )}
                </div>
                {event.isFeatured && (
                  <Star className="h-5 w-5 text-amber-500 fill-amber-500 shrink-0 mt-1" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-gray-400" />
                  {formatShortDate(event.startDate)} –{" "}
                  {formatShortDate(event.endDate)}
                </span>
                {event.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {event.location}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Post-checkout cancel banner ─────────────────── */}
        {purchaseStatus === "cancelled" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-amber-500 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Payment was not completed</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Your payment was cancelled or did not go through. No charge was made. You can try again below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Schedule ────────────────────────────────────────── */}
        {sessions.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">
              Schedule
            </h2>
            <div className="space-y-5">
              {sortedDates.map((date) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {formatDate(date)}
                  </h3>
                  <div className="space-y-2">
                    {sessionsByDate[date].map((s) => (
                      <div
                        key={s.id}
                        className="rounded-lg border border-gray-200 bg-white p-4 flex items-start gap-4"
                      >
                        <div className="shrink-0 text-center pt-0.5">
                          <div className="text-sm font-semibold text-gray-900">
                            {s.startTime}
                          </div>
                          <div className="text-xs text-gray-400">
                            {s.endTime}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">
                              {s.title}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                SESSION_TYPE_COLORS[s.sessionType] ??
                                SESSION_TYPE_COLORS.other
                              }`}
                            >
                              {SESSION_TYPE_LABELS[s.sessionType] ??
                                s.sessionType}
                            </span>
                          </div>
                          {s.teacherName && (
                            <p className="mt-0.5 text-sm text-gray-500">
                              {s.teacherName}
                            </p>
                          )}
                          {s.description && (
                            <p className="mt-1 text-sm text-gray-500">
                              {s.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                            {s.room && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {s.room}
                              </span>
                            )}
                            {s.capacity && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" /> Capacity:{" "}
                                {s.capacity}
                              </span>
                            )}
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

        {/* ── Products / Prices ───────────────────────────────── */}
        {products.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">
              Tickets & Passes
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <span className="text-lg font-bold text-bpm-700 shrink-0">
                      {centsToEuros(p.priceCents)}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-1 text-sm text-gray-500">
                      {p.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA / Guest purchase ─────────────────────────────── */}
        {products.length > 0 ? (
          <GuestPurchaseSection
            event={event}
            products={products}
            stripeEnabled={stripeEnabled}
            allowReceptionPayment={allowReceptionPayment}
          />
        ) : (
          <div className="rounded-xl border border-bpm-200 bg-gradient-to-r from-bpm-50 to-white p-6 text-center space-y-4">
            <Ticket className="h-8 w-8 text-bpm-500 mx-auto" />
            <div>
              <h3 className="font-display text-lg font-semibold text-gray-900">
                Interested?
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Log in or create an account for more details.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
                Log in <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Create account
              </Link>
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────── */}
        <footer className="text-center pt-4 pb-8">
          <p className="text-xs text-gray-400">
            Balance Power Motion — Dublin&apos;s social dance academy
          </p>
        </footer>
      </main>
    </div>
  );
}

// ── Guest Purchase Section ────────────────────────────────────

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-1 focus:ring-bpm-500";

function GuestPurchaseSection({
  event,
  products,
  stripeEnabled,
  allowReceptionPayment,
}: {
  event: MockSpecialEvent;
  products: MockEventProduct[];
  stripeEnabled: boolean;
  allowReceptionPayment: boolean;
}) {
  const [mode, setMode] = useState<"choice" | "guest" | "success">("choice");
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  function handleReceptionPurchase() {
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your full name."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (!selectedProductId) { setError("Please select a product."); return; }
    setError(null);
    startTransition(async () => {
      const res = await createGuestEventPurchaseAction({
        eventProductId: selectedProductId,
        eventId: event.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      if (res.success) setMode("success");
      else setError(res.error ?? "Something went wrong. Please try again.");
    });
  }

  function handleStripePurchase() {
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your full name."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (!selectedProductId) { setError("Please select a product."); return; }
    setError(null);
    startTransition(async () => {
      const res = await createGuestEventStripeCheckoutAction({
        eventProductId: selectedProductId,
        eventId: event.id,
        guestName: `${firstName.trim()} ${lastName.trim()}`,
        guestEmail: email.trim(),
        guestPhone: phone.trim() || undefined,
      });
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        setError(res.error ?? "Could not start payment. Please try again.");
      }
    });
  }

  if (mode === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
        <h3 className="font-display text-lg font-semibold text-gray-900">Purchase registered</h3>
        <p className="text-sm text-gray-600">
          Your reservation for <strong>{selectedProduct?.name}</strong> has been registered.
          Please complete payment at reception when you arrive.
        </p>
        <p className="text-sm text-gray-500">A confirmation email has been sent to <strong>{email}</strong>.</p>
      </div>
    );
  }

  if (mode === "choice") {
    return (
      <div className="rounded-xl border border-bpm-200 bg-gradient-to-r from-bpm-50 to-white p-6 text-center space-y-4">
        <Ticket className="h-8 w-8 text-bpm-500 mx-auto" />
        <div>
          <h3 className="font-display text-lg font-semibold text-gray-900">Ready to join?</h3>
          <p className="mt-1 text-sm text-gray-500">Already have an account, or buy as a guest.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Log in to purchase <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setMode("guest")}
            className="inline-flex items-center gap-2 rounded-lg border border-bpm-300 bg-white px-5 py-2.5 text-sm font-medium text-bpm-700 hover:bg-bpm-50 transition-colors"
          >
            Buy as guest
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-bpm-600 hover:underline">Create one</Link>{" "}
          to manage your bookings.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="text-center">
        <h3 className="font-display text-lg font-semibold text-gray-900">Guest purchase</h3>
        <p className="mt-1 text-sm text-gray-500">Fill in your details and choose a ticket.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First name *</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="First name" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last name *</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Last name" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="your@email.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      {products.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select ticket</label>
          <div className="space-y-2">
            {products.map((p) => (
              <label
                key={p.id}
                className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedProductId === p.id
                    ? "border-bpm-500 bg-bpm-50 ring-1 ring-bpm-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="guestProduct"
                    value={p.id}
                    checked={selectedProductId === p.id}
                    onChange={() => setSelectedProductId(p.id)}
                    className="h-4 w-4 text-bpm-600 focus:ring-bpm-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                  </div>
                </div>
                <span className="text-sm font-bold text-bpm-700 shrink-0">{centsToEuros(p.priceCents)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {products.length === 1 && selectedProduct && (
        <div className="flex items-center justify-between rounded-lg border border-bpm-200 bg-bpm-50 p-3">
          <span className="text-sm font-medium text-gray-900">{selectedProduct.name}</span>
          <span className="text-sm font-bold text-bpm-700">{centsToEuros(selectedProduct.priceCents)}</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {stripeEnabled && (
          <button
            onClick={handleStripePurchase}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pay online
          </button>
        )}
        {allowReceptionPayment && (
          <button
            onClick={handleReceptionPurchase}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Pay at reception
          </button>
        )}
      </div>

      {!stripeEnabled && !allowReceptionPayment && (
        <p className="text-sm text-amber-600 text-center">
          Payment is not currently available for this event. Please contact the academy directly.
        </p>
      )}

      <div className="text-center">
        <button onClick={() => setMode("choice")} className="text-sm text-gray-500 hover:text-gray-700">
          Back
        </button>
      </div>
    </div>
  );
}
