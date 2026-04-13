"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  CalendarPlus,
  BookOpen,
  XCircle,
  QrCode,
  Calendar,
  CalendarDays,
  X,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RowMeta,
  MetaTime,
  MetaLocation,
  PricePill,
  ActionPill,
  StatusPill,
  SectionLabel,
  TipBox,
  InlineBadge,
  ProductListItem,
  ClassListItem,
  BookingListItem,
} from "@/components/student/primitives";

const STORAGE_KEY = "bpm_onboarding_dismissed";

type OnboardingPhase = "idle" | "welcome" | "tour";

// ── Hook ─────────────────────────────────────────────────────

export function useOnboardingAutoOpen(isGetStartedState: boolean) {
  const [phase, setPhase] = useState<OnboardingPhase>("idle");

  useEffect(() => {
    if (!isGetStartedState) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    setPhase("welcome");
  }, [isGetStartedState]);

  const open = useCallback(() => setPhase("tour"), []);
  const startTour = useCallback(() => setPhase("tour"), []);
  const close = useCallback(() => setPhase("idle"), []);
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("idle");
  }, []);
  const skipWelcome = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("idle");
  }, []);

  return {
    phase,
    showWelcome: phase === "welcome",
    showTour: phase === "tour",
    open,
    startTour,
    close,
    dismiss,
    skipWelcome,
  };
}

// ── Step definitions ─────────────────────────────────────────

interface WalkthroughStep {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  spotlightSelector?: string;
  linkTo?: string;
  linkLabel?: string;
  Preview: () => React.JSX.Element;
}

const STEPS: WalkthroughStep[] = [
  {
    icon: ShoppingBag,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    title: "Buy a product",
    body: "Browse the catalog and pick a membership for regular classes, a class pack for flexibility, or a single drop-in.",
    linkTo: "/catalog",
    linkLabel: "Browse products",
    Preview: CatalogPreview,
  },
  {
    icon: CalendarPlus,
    iconBg: "bg-bpm-100",
    iconColor: "text-bpm-600",
    title: "Book a class",
    body: "Check this week\u2019s schedule and tap Book on any class your product covers. Full class? Join the waitlist.",
    linkTo: "/classes",
    linkLabel: "View classes",
    Preview: ClassesPreview,
  },
  {
    icon: BookOpen,
    iconBg: "bg-blue-100",
    iconColor: "text-bpm-600",
    title: "View your bookings",
    body: "All your upcoming and past bookings in one place \u2014 class name, date, time, and status at a glance.",
    linkTo: "/bookings",
    linkLabel: "Go to bookings",
    Preview: BookingsPreview,
  },
  {
    icon: XCircle,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Cancel a booking",
    body: "Tap Cancel on any upcoming booking. You can restore it afterwards if the class hasn\u2019t started yet.",
    Preview: CancelPreview,
  },
  {
    icon: QrCode,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    title: "Show your QR code",
    body: "When you arrive for class, tap Show QR on your dashboard. The teacher scans it to check you in \u2014 fast and easy.",
    spotlightSelector: "[data-tour='qr-button']",
    Preview: QrPreview,
  },
  {
    icon: Calendar,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    title: "How terms work",
    body: "BPM runs on 4-week terms. Some products are linked to a specific term. When purchasing, you can choose the current or next term \u2014 but the current term is only available during its first 2 weeks.",
    spotlightSelector: "[data-tour='term-banner']",
    Preview: TermsPreview,
  },
];

// ── Mock preview panels (using shared primitives) ───────────

function CatalogPreview() {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-3 space-y-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Products</p>
          <p className="mt-0.5 text-[10px] text-gray-500">Browse memberships, passes &amp; drop-ins</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">All</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Memberships</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Passes</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Drop-in</span>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <SectionLabel>Memberships</SectionLabel>
            <ProductListItem
              name="Gold Membership"
              desc="Unlimited classes &middot; 1 term"
              price={<PricePill accent>&euro;99</PricePill>}
              border="border-emerald-200"
              bg="bg-emerald-50/60"
              chevron
            />
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Passes</SectionLabel>
            <ProductListItem
              name="Class Pack (8)"
              desc="8 classes &middot; any style"
              price={<PricePill>&euro;72</PricePill>}
              chevron
            />
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Drop-in</SectionLabel>
            <ProductListItem
              name="Drop-In"
              desc="Single class"
              price={<PricePill>&euro;12</PricePill>}
              chevron
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassesPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const classes = [
    { name: "Bachata Beginners 1", time: "20:30", loc: "Studio A", style: "Bachata" },
    { name: "Cuban Improvers", time: "18:30", loc: "Studio A", style: "Cuban" },
  ];
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-3 space-y-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Classes</p>
          <p className="mt-0.5 text-[10px] text-gray-500">Browse and book your classes</p>
        </div>

        <div className="rounded-md border border-bpm-100 bg-bpm-50/70 px-2 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 text-bpm-500" />
              <span className="text-[10px] font-semibold text-bpm-800">Spring 2026</span>
            </div>
            <span className="text-[10px] text-bpm-600">Week 4 / 10</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-1 w-[40%] rounded-full bg-bpm-500" />
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-2">
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d, i) => (
              <div
                key={d}
                className={`flex flex-col items-center rounded-md py-1 text-center ${
                  i === 0
                    ? "bg-bpm-600 text-white"
                    : "text-gray-400"
                }`}
              >
                <span className="text-[8px] font-medium uppercase">{d}</span>
                <span className={`text-[11px] font-semibold ${i === 0 ? "text-white" : "text-gray-700"}`}>{7 + i}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-900">Today</p>
          <p className="text-[10px] text-gray-500">2 classes</p>
        </div>

        <div className="space-y-1.5">
          {classes.map((c) => (
            <ClassListItem
              key={c.name}
              name={c.name}
              badges={<InlineBadge>{c.style}</InlineBadge>}
              meta={<RowMeta><MetaTime>{c.time}</MetaTime><MetaLocation>{c.loc}</MetaLocation></RowMeta>}
              action={<ActionPill>Book</ActionPill>}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BookingsPreview() {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900">My Bookings</p>
            <p className="mt-0.5 text-[10px] text-gray-500">Upcoming and past bookings</p>
          </div>
          <span className="shrink-0 rounded-md bg-bpm-600 px-2 py-1 text-[10px] font-medium text-white">Book a class</span>
        </div>

        <SectionLabel>Upcoming (2)</SectionLabel>

        <div className="space-y-1.5">
          <BookingListItem
            name="Bachata Beginners 1"
            meta={<RowMeta><span>Mon 20:30 &middot; Studio A</span></RowMeta>}
            status={<StatusPill label="Confirmed" variant="confirmed" icon />}
            border="border-green-200"
            action={
              <span className="rounded-md p-1 text-gray-400">
                <XCircle className="h-3.5 w-3.5" />
              </span>
            }
          />
          <BookingListItem
            name="Salsa Line Improvers"
            meta={<RowMeta><span>Tue 19:30 &middot; Studio A</span></RowMeta>}
            status={<StatusPill label="Waitlisted" variant="waitlisted" icon />}
            border="border-amber-200"
            action={
              <span className="rounded-md p-1 text-gray-400">
                <XCircle className="h-3.5 w-3.5" />
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}

function CancelPreview() {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-3 space-y-3">
        <SectionLabel>Upcoming (1)</SectionLabel>
        <BookingListItem
          name="Cuban Beginners 1"
          meta={<RowMeta><span>Wed 18:30 &middot; Studio A</span></RowMeta>}
          status={<StatusPill label="Confirmed" variant="confirmed" icon />}
          border="border-green-200"
          action={
            <button className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          }
        />
        <TipBox>
          <span className="font-medium">Tip:</span> Cancelling within 2 hours
          of class time may incur a late-cancel fee.
        </TipBox>
      </div>
    </div>
  );
}

function QrPreview() {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-3">
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50">
            <QrCode className="h-10 w-10 text-violet-400" />
          </div>
          <p className="text-[11px] text-gray-500 text-center">
            Show this when you arrive for class
          </p>
        </div>
      </div>
    </div>
  );
}

function TermsPreview() {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-3 space-y-2.5">
        <div className="rounded-md border border-bpm-100 bg-bpm-50/70 px-2 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 text-bpm-500" />
              <span className="text-[10px] font-semibold text-bpm-800">Spring 2026</span>
            </div>
            <span className="text-[10px] text-bpm-600">Week 2 / 4</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-1.5 w-[50%] rounded-full bg-bpm-500" />
          </div>
        </div>

        <div className="flex items-start gap-2.5 opacity-50">
          <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gray-300" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500">Next term</p>
            <p className="text-[10px] text-gray-400">
              Choose next term after week 2
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Spotlight overlay ────────────────────────────────────────

function SpotlightOverlay({ rect }: { rect: DOMRect }) {
  const pad = 8;
  const r = 12;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <mask id="walkthrough-spotlight">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={r}
            ry={r}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.45)"
        mask="url(#walkthrough-spotlight)"
        style={{ pointerEvents: "auto" }}
      />
    </svg>
  );
}

// ── Walkthrough modal ────────────────────────────────────────

export function StudentWalkthrough({
  onClose,
  onDismiss,
}: {
  onClose: () => void;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  useEffect(() => {
    if (!current.spotlightSelector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(current.spotlightSelector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      requestAnimationFrame(() => {
        setSpotlightRect(el.getBoundingClientRect());
      });
    } else {
      setSpotlightRect(null);
    }
  }, [step, current.spotlightSelector]);

  function handleClose() {
    if (dontShow) onDismiss();
    else onClose();
  }

  function handleLink(href: string) {
    handleClose();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50" onClick={handleClose}>
      {spotlightRect ? (
        <SpotlightOverlay rect={spotlightRect} />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div className="relative z-10 flex h-full items-center justify-center p-4 pt-[env(safe-area-inset-top,16px)] pointer-events-none">
        <div
          className="w-full max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* Close */}
            <div className="sticky top-0 z-10">
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-3 right-3 rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 px-6 pt-5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= step ? "bg-bpm-500" : "bg-gray-200"
                  } ${i === step ? "scale-y-125" : ""}`}
                />
              ))}
            </div>
            <p className="px-6 pt-2 text-[11px] text-gray-400">
              Step {step + 1} of {STEPS.length}
            </p>

            {/* Content */}
            <div className="px-6 pt-4 pb-2">
              <div
                className={`inline-flex items-center justify-center rounded-xl p-3 ${current.iconBg}`}
              >
                <Icon className={`h-7 w-7 ${current.iconColor}`} />
              </div>
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                {current.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {current.body}
              </p>

              {/* Mock preview */}
              <current.Preview />

              {current.linkTo && (
                <button
                  type="button"
                  onClick={() => handleLink(current.linkTo!)}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-bpm-600 hover:text-bpm-700 transition-colors"
                >
                  {current.linkLabel ?? "Go there now"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Fixed footer */}
          <div className="shrink-0 border-t border-gray-100 px-6 pb-5 pt-3 space-y-3 bg-white">
            <div className="flex items-center justify-between gap-3">
              {isFirst ? (
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Skip
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              {isLast ? (
                <Button size="sm" onClick={handleClose}>
                  Got it, let&apos;s go!
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
              />
              <span className="text-xs text-gray-500">
                Don&apos;t show this again
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Welcome Modal (shown before tour) ───────────────────────

export function WelcomeModal({
  onStartTour,
  onSkip,
}: {
  onStartTour: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" onClick={onSkip}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 flex h-full items-center justify-center p-4 pt-[env(safe-area-inset-top,16px)] pointer-events-none">
        <div
          className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-8 pb-2 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bpm-100">
              <CalendarPlus className="h-7 w-7 text-bpm-600" />
            </div>
            <h2 className="font-display text-xl font-bold text-gray-900">
              Welcome to BPM
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-gray-600 max-w-[280px] mx-auto">
              Welcome to your student dashboard.
              We&apos;ll show you a quick tour so you can learn how to buy
              a product, book classes, manage bookings, and use your QR code.
            </p>
          </div>
          <div className="px-6 pt-4 pb-6 space-y-2.5">
            <button
              type="button"
              onClick={onStartTour}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-bpm-600 to-bpm-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-shadow hover:shadow-md"
            >
              Start tour
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700 hover:bg-gray-50"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
