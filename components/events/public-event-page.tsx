"use client";

import { useEffect, useState, useTransition } from "react";
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
  Lock,
  Sparkles,
} from "lucide-react";
import { EventHero } from "./event-hero";
import {
  createGuestEventPurchaseAction,
  createFreeGuestEventPurchaseAction,
} from "@/lib/actions/event-purchase";
import { createGuestEventStripeCheckoutAction } from "@/lib/actions/stripe-checkout";
import { PromoCodeInput } from "@/components/events/promo-code-input";
import {
  HeroBookNowButton,
  StickyBookNowBar,
} from "@/components/events/mobile-book-now-cta";
import {
  isBeginnerFriendlyEvent,
  summarizeEventPrices,
} from "@/lib/analytics/event-cta";
import type {
  MockSpecialEvent,
  MockEventSession,
  MockEventProduct,
} from "@/lib/mock-data";

import { formatEventDateRange, formatEventDT, formatSessionTimeRange } from "@/lib/utils";

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

  // Phase 12 — Book-now CTAs.
  //
  // Phase 13 gate — the paid-ads mobile UX (mobile summary card,
  // hero Book-now button, sticky bottom bar, extra bottom padding)
  // only renders when the admin has explicitly opted this event in
  // via `event.isMarketingLanding`. Any pre-Phase-13 event stays on
  // the standard layout untouched.
  //
  // Guest-only tickets (i.e. anything NOT members-only) are the ones
  // the CTAs can actually take a beginner into. If the entire event
  // is members-only there's nothing a guest can book, so we hide the
  // sticky bar and disable the hero button. The mobile summary card
  // itself always renders when campaign mode is on.
  const isCampaignMode = event.isMarketingLanding === true;
  const purchasableProducts = products.filter((p) => !p.membersOnly);
  const canGuestBook = purchasableProducts.length > 0;
  const priceSummary = summarizeEventPrices(purchasableProducts);
  const beginnerFriendly = isBeginnerFriendlyEvent({
    title: event.title,
    subtitle: event.subtitle,
    description: event.description,
    productNames: products.map((p) => p.name),
  });

  // `openSignal` is a monotonically-increasing counter the child
  // `GuestPurchaseSection` watches to imperatively open the guest
  // form (and skip the "choice" screen). Keeps GuestPurchaseSection's
  // internal `mode` state encapsulated while letting the CTAs above
  // trigger it. Every click bumps the counter — including a repeat
  // click once the form is already open, which is a no-op inside the
  // child effect (the `mode` transition is idempotent).
  const [openSignal, setOpenSignal] = useState(0);

  function scrollToBooking() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("book-tickets");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleBookNow() {
    setOpenSignal((s) => s + 1);
    scrollToBooking();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="bg-zinc-900 text-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <span className="font-display text-lg font-semibold tracking-tight">
            BPM Dance Academy
          </span>
          {/*
            Phase 12 — Log in stays secondary on the public event page
            (small pill, faded background). Guest checkout is the
            primary path via the CTAs below.
          */}
          <Link
            href="/login"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      {/*
        Phase 12 — extra bottom padding on mobile so the sticky bar
        never occludes the last section (footer / promo code helper).
        Phase 13 — only add that reserve when campaign mode is on;
        non-campaign events keep the original spacing so we don't
        introduce dead space on the standard layout.
      */}
      <main
        className={
          isCampaignMode
            ? "mx-auto max-w-3xl px-4 py-8 space-y-8 pb-32 md:pb-8"
            : "mx-auto max-w-3xl px-4 py-8 space-y-8"
        }
      >
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
                  {formatEventDateRange(event.startDate, event.endDate)}
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

        {/* ── Phase 12 — Compact mobile summary + hero CTA ────
            A conversion-focused summary card that surfaces the most
            important facts (date/time, location, price, beginner
            note) above the fold on mobile. Hidden on `md+` because
            the hero above already shows all of this comfortably.
            Phase 13 — only rendered when this event has been opted
            in to campaign mode by an admin. */}
        {isCampaignMode && (
          <>
            <MobileSummaryCard
              event={event}
              fromPriceCents={priceSummary.fromCents}
              allSamePrice={priceSummary.allSamePrice}
              beginnerFriendly={beginnerFriendly}
            />
            <div className="md:hidden">
              <HeroBookNowButton
                eventId={event.id}
                eventName={event.title}
                fromPriceCents={priceSummary.fromCents}
                allSamePrice={priceSummary.allSamePrice}
                onBookNow={handleBookNow}
                disabled={!canGuestBook}
              />
              {!canGuestBook && (
                <p className="mt-2 text-center text-xs text-blue-700">
                  This event has members-only tickets. Log in with your member account to purchase.
                </p>
              )}
            </div>
          </>
        )}

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
                    {formatEventDT(date)}
                  </h3>
                  <div className="space-y-2">
                    {sessionsByDate[date].map((s) => (
                      <div
                        key={s.id}
                        className="rounded-lg border border-gray-200 bg-white p-4 flex items-start gap-4"
                      >
                        <div className="shrink-0 text-center pt-0.5">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatSessionTimeRange(s.date, s.startTime, s.endTime)}
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
                  className={`rounded-xl border p-5 flex flex-col ${p.membersOnly ? "border-blue-200 bg-blue-50/40" : "border-gray-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                      {p.membersOnly && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium shrink-0">
                          <Lock className="h-2.5 w-2.5" /> Members only
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-bold text-bpm-700 shrink-0">
                      {centsToEuros(p.priceCents)}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-1 text-sm text-gray-500">
                      {p.description}
                    </p>
                  )}
                  {p.membersOnly && (
                    <p className="mt-2 text-xs text-blue-700">
                      This ticket is only available to active members.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA / Guest purchase ─────────────────────────────── */}
        {/*
          Phase 12 — the `book-tickets` id is the target of the
          mobile Book-now CTAs' scrollIntoView. Kept on the wrapper
          (not the section) so scrolling lands on the section
          header for context, not mid-form.
        */}
        <section id="book-tickets" aria-label="Book tickets">
          {products.length > 0 ? (
            <GuestPurchaseSection
              event={event}
              products={products}
              stripeEnabled={stripeEnabled}
              allowReceptionPayment={allowReceptionPayment}
              openSignal={openSignal}
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
        </section>

        {/* ── Footer ──────────────────────────────────────────── */}
        <footer className="text-center pt-4 pb-8">
          <p className="text-xs text-gray-400">
            Balance Power Motion — Dublin&apos;s social dance academy
          </p>
        </footer>
      </main>

      {/*
        Phase 12 — mobile-only sticky bottom CTA.
        Phase 13 — gated behind campaign mode: only renders when the
        admin has ticked "Optimise this event page for new students /
        ads" AND the event actually has a guest-purchasable ticket.
        Hidden automatically on `md+` via `md:hidden` inside the
        component.
      */}
      {isCampaignMode && canGuestBook && (
        <StickyBookNowBar
          eventId={event.id}
          eventName={event.title}
          fromPriceCents={priceSummary.fromCents}
          allSamePrice={priceSummary.allSamePrice}
          onBookNow={handleBookNow}
        />
      )}
    </div>
  );
}

// ── Phase 12 — Mobile summary card ───────────────────────────
//
// Renders on mobile only. Repeats the essentials (date/time,
// location, from-price, "no account needed", optional
// beginner-friendly badge) in a scannable card, right under the hero.
// On desktop the hero already contains all this info comfortably in
// one row, so the card is `md:hidden`.

function MobileSummaryCard({
  event,
  fromPriceCents,
  allSamePrice,
  beginnerFriendly,
}: {
  event: MockSpecialEvent;
  fromPriceCents: number | null;
  allSamePrice: boolean;
  beginnerFriendly: boolean;
}) {
  const priceLabel =
    typeof fromPriceCents === "number"
      ? allSamePrice
        ? `€${(fromPriceCents / 100).toFixed(0)}`
        : `from €${(fromPriceCents / 100).toFixed(0)}`
      : null;

  return (
    <div className="md:hidden rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {beginnerFriendly && (
          <span
            data-testid="beginner-friendly-badge"
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-medium border border-emerald-100"
          >
            <Sparkles className="h-3 w-3" />
            Beginner-friendly
          </span>
        )}
        {priceLabel && (
          <span className="inline-flex items-center gap-1 rounded-full bg-bpm-50 text-bpm-700 px-2 py-0.5 text-[11px] font-semibold border border-bpm-100">
            {priceLabel}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 text-gray-600 px-2 py-0.5 text-[11px] font-medium border border-gray-200">
          No account needed
        </span>
      </div>
      <div className="space-y-1.5 text-sm text-gray-700">
        <div className="flex items-start gap-2">
          <CalendarDays className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <span>{formatEventDateRange(event.startDate, event.endDate)}</span>
        </div>
        {event.location && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
      </div>
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
  openSignal = 0,
}: {
  event: MockSpecialEvent;
  products: MockEventProduct[];
  stripeEnabled: boolean;
  allowReceptionPayment: boolean;
  /**
   * Phase 12 — monotonically-increasing counter from the parent.
   * When it changes we auto-open the guest form (skipping the
   * "choice" screen). Callers only bump this when the user
   * explicitly hits a Book-now CTA above, so the current behaviour
   * of showing the choice screen on first render is unchanged.
   */
  openSignal?: number;
}) {
  // Guests can never purchase members-only tickets — membership cannot
  // be verified without an authenticated account. Filter them out of the
  // selectable list; the products section above still shows them with a
  // "Members only" badge so non-members can see they exist.
  const purchasableProducts = products.filter((p) => !p.membersOnly);
  const hasMembersOnlyProducts = products.some((p) => p.membersOnly);
  const onlyMembersOnly = purchasableProducts.length === 0 && hasMembersOnlyProducts;

  const [mode, setMode] = useState<"choice" | "guest" | "success">("choice");

  // Phase 12 — react to Book-now CTA. Only advance from "choice" to
  // "guest"; a repeat click while already on "guest" or "success" is
  // a no-op. Never overrides a completed "success" state.
  useEffect(() => {
    if (openSignal <= 0) return;
    if (mode === "choice" && purchasableProducts.length > 0) {
      setMode("guest");
    }
    // Intentionally omit `mode` from deps — we want to react to
    // signal changes only, not to internal mode transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  const [selectedProductId, setSelectedProductId] = useState<string>(purchasableProducts[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [promo, setPromo] = useState<{
    code: string;
    basePriceCents: number;
    discountAmountCents: number;
    finalPriceCents: number;
  } | null>(null);

  const selectedProduct = purchasableProducts.find((p) => p.id === selectedProductId);
  // Phase 11 — a valid promo that brings the total to €0 collapses
  // the payment choice: no Stripe session, no reception queue, just a
  // free registration.
  const isZeroTotal = !!promo && promo.finalPriceCents === 0;

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
        promoCode: promo?.code ?? null,
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
      // Phase 11 — if an applied promo brings the total to €0 we skip
      // Stripe entirely (Stripe rejects zero-amount sessions) and go
      // through the dedicated comped-purchase server action. The
      // server re-validates the code + eligibility, so a tampered
      // client cannot force a free ticket. On success we redirect to
      // the SAME event checkout-success page — the conversion tracker
      // still mounts and fires Purchase(value=0, currency=EUR).
      if (promo && promo.finalPriceCents === 0 && promo.code) {
        const free = await createFreeGuestEventPurchaseAction({
          eventProductId: selectedProductId,
          eventId: event.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          promoCode: promo.code,
        });
        if (free.success && free.redirectUrl) {
          window.location.href = free.redirectUrl;
        } else {
          setError(free.error ?? "Could not complete free registration. Please try again.");
        }
        return;
      }

      const res = await createGuestEventStripeCheckoutAction({
        eventProductId: selectedProductId,
        eventId: event.id,
        guestName: `${firstName.trim()} ${lastName.trim()}`,
        guestEmail: email.trim(),
        guestPhone: phone.trim() || undefined,
        promoCode: promo?.code ?? null,
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
    if (onlyMembersOnly) {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-6 text-center space-y-4">
          <Lock className="h-8 w-8 text-blue-600 mx-auto" />
          <div>
            <h3 className="font-display text-lg font-semibold text-gray-900">Members only</h3>
            <p className="mt-1 text-sm text-gray-600">
              This ticket is only available to active members. Please log in with your member account to purchase.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {/*
              Phase 11 — this callout appears when the only tickets on
              the event are "Members only". The user needs an active
              membership before they can buy, so on successful login we
              deliberately redirect to the passes catalog rather than
              the neutral /dashboard. `next` is URL-encoded so
              /catalog?tab=passes round-trips correctly through
              `safeRedirectPath` in the login page.
            */}
            <Link
              href={`/login?next=${encodeURIComponent("/catalog?tab=passes")}`}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
            >
              Log in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-bpm-200 bg-gradient-to-r from-bpm-50 to-white p-6 text-center space-y-4">
        <Ticket className="h-8 w-8 text-bpm-500 mx-auto" />
        <div>
          <h3 className="font-display text-lg font-semibold text-gray-900">Ready to join?</h3>
          <p className="mt-1 text-sm text-gray-500">Already have an account, or buy as a guest.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {/*
            Phase 11 — "Log in to purchase" appears on public event
            landings where the user has expressed purchase intent. Send
            them to the passes catalog after login so returning members
            land somewhere useful; users who intend to log in for other
            reasons still have the /login top-bar link.
          */}
          <Link
            href={`/login?next=${encodeURIComponent("/catalog?tab=passes")}`}
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
        {hasMembersOnlyProducts && (
          <p className="text-xs text-blue-700">
            Some tickets above are marked &ldquo;Members only&rdquo; and require an active member account — log in to purchase those.
          </p>
        )}
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

      {purchasableProducts.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select ticket</label>
          <div className="space-y-2">
            {purchasableProducts.map((p) => (
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
          {hasMembersOnlyProducts && (
            <p className="mt-2 text-xs text-blue-700">
              Members-only tickets are not shown here. Log in with your member account to purchase them.
            </p>
          )}
        </div>
      )}

      {purchasableProducts.length === 1 && selectedProduct && (
        <div className="flex items-center justify-between rounded-lg border border-bpm-200 bg-bpm-50 p-3">
          <span className="text-sm font-medium text-gray-900">{selectedProduct.name}</span>
          <span className="text-sm font-bold text-bpm-700">{centsToEuros(selectedProduct.priceCents)}</span>
        </div>
      )}

      {selectedProduct && (
        <PromoCodeInput
          key={selectedProduct.id}
          eventId={event.id}
          eventProductId={selectedProduct.id}
          studentId={null}
          guestEmail={email}
          basePriceCents={selectedProduct.priceCents}
          onApplied={setPromo}
          disabled={isPending}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/*
          Phase 11 — when the promo brings the total to €0 we hide
          "Pay at reception" (nothing to pay there) and relabel the
          primary button to make it clear this is a free registration
          rather than a payment. The action wiring behind the button
          still short-circuits to createFreeGuestEventPurchaseAction.
        */}
        {isZeroTotal ? (
          <button
            onClick={handleStripePurchase}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Register for free
          </button>
        ) : (
          <>
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
          </>
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
