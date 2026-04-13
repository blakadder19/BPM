"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarPlus,
  Calendar,
  Inbox,
  Clock,
  CreditCard,
  RefreshCw,
  ScrollText,
  Gift,
  Star,
  Music,
  Cake,
  QrCode,
  ArrowRight,
  User,
  Pencil,
  ShoppingBag,
  X,
  ChevronDown,
  ChevronRight,
  History,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  CompactRow,
  RowMeta,
  MetaLocation,
  ActionPill,
  StatusPill,
  InlineBadge,
  RowTitle,
  ClassListItem,
  BookingListItem,
  formatRoleLabel,
} from "@/components/student/primitives";
import { CocAcceptanceDialog } from "@/components/booking/coc-acceptance-dialog";
import {
  StudentBookDialog,
  type BookDialogClass,
} from "@/components/booking/student-book-dialog";
import { useOnboardingAutoOpen, StudentWalkthrough } from "@/components/dashboard/student-onboarding";
import { updateOwnPreferredRoleAction } from "@/lib/actions/students";
import { toggleAutoRenewAction } from "@/lib/actions/catalog-purchase";
import { payPendingSubscriptionAction } from "@/lib/actions/stripe-checkout";
import { formatDate } from "@/lib/utils";
import { TermBanner } from "@/components/ui/term-banner";
import type { MemberBenefitsSummary } from "@/lib/domain/member-benefits";
import type { ValidEntitlement } from "@/lib/domain/entitlement-rules";
import type { DanceRole, ProductType } from "@/types/domain";

export interface StudentBookingSummary {
  id: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  danceRole: string | null;
  danceStyleRequiresBalance: boolean;
  status: string;
}

export interface StudentTermInfo {
  name: string;
  startDate: string;
  endDate: string;
  weekNumber: number;
}

export interface StudentEntitlementSummary {
  id: string;
  productName: string;
  productType: ProductType;
  description: string | null;
  status: string;
  classesUsed: number;
  classesPerTerm: number | null;
  remainingCredits: number | null;
  totalCredits: number | null;
  autoRenew: boolean;
  canToggleAutoRenew: boolean;
  termName: string | null;
  selectedStyleName: string | null;
  validFrom: string;
  validUntil: string | null;
  paymentStatus: string | null;
  daysUntilExpiry: number | null;
  isRenewal: boolean;
  isFutureTerm: boolean;
}

export interface TodayForYouItem {
  id: string;
  title: string;
  styleName: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  spotsLeft: number | null;
  danceStyleRequiresBalance: boolean;
  entitlements: ValidEntitlement[];
  autoSelected?: ValidEntitlement;
  isWaitlist: boolean;
  waitlistReason?: string;
}

interface StudentDashboardProps {
  fullName: string;
  dateOfBirth?: string | null;
  upcomingBookings: StudentBookingSummary[];
  termInfo?: StudentTermInfo | null;
  entitlements?: StudentEntitlementSummary[];
  lastPlan?: StudentEntitlementSummary | null;
  waitlistedCount?: number;
  stripeEnabled?: boolean;
  codeOfConductAccepted?: boolean;
  benefits?: MemberBenefitsSummary | null;
  qrToken?: string | null;
  todayForYou?: TodayForYouItem[];
  studentPreferredRole?: DanceRole | null;
}

export function StudentDashboard({
  fullName,
  dateOfBirth,
  upcomingBookings,
  termInfo,
  entitlements = [],
  lastPlan,
  waitlistedCount = 0,
  stripeEnabled = false,
  codeOfConductAccepted,
  benefits,
  qrToken,
  todayForYou = [],
  studentPreferredRole,
}: StudentDashboardProps) {
  const firstName = fullName.split(" ")[0];
  const router = useRouter();

  const [bookTarget, setBookTarget] = useState<TodayForYouItem | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const USABLE_PAYMENT = new Set(["paid", "complimentary", "waived"]);
  const hasUsableEntitlement = entitlements.some(
    (e) => e.status === "active" && (USABLE_PAYMENT.has(e.paymentStatus ?? "") || !e.paymentStatus)
  );
  const hasOnlyPendingEntitlements = entitlements.length > 0 && !hasUsableEntitlement;
  const isGetStartedState = !hasUsableEntitlement && !hasOnlyPendingEntitlements;
  const onboarding = useOnboardingAutoOpen(isGetStartedState);

  function navigateTo(href: string, id: string) {
    setLoadingId(id);
    router.push(href);
  }

  useEffect(() => {
    const hash = window.location.hash;
    if (hash?.startsWith("#entitlement-")) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
        el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2"), 4000);
      }
    }
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your dance classes at a glance."
      />

      {/* Current Term Banner */}
      {termInfo && (
        <TermBanner
          name={termInfo.name}
          startDate={termInfo.startDate}
          endDate={termInfo.endDate}
          weekNumber={termInfo.weekNumber}
        />
      )}

      {/* Code of Conduct Banner */}
      {codeOfConductAccepted === false && (
        <CocBanner />
      )}

      {/* My Profile */}
      <ProfileCard
        dateOfBirth={dateOfBirth ?? null}
        preferredRole={studentPreferredRole ?? null}
      />

      {/* Hero CTA area — adapts based on entitlement state */}
      <div className="space-y-3">
        {/* Primary hero card */}
        {hasUsableEntitlement ? (
          <button
            type="button"
            onClick={() => navigateTo("/classes", "hero")}
            disabled={loadingId === "hero"}
            className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-bpm-600 to-bpm-500 p-4 text-left transition-shadow hover:shadow-lg active:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <CalendarPlus className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white">
                {loadingId === "hero" ? "Loading…" : "Book a Class"}
              </p>
              <p className="text-xs text-bpm-100">Browse schedule and sign up</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/70 shrink-0" />
          </button>
        ) : hasOnlyPendingEntitlements ? (
          <button
            type="button"
            onClick={() => {
              const pending = entitlements.find((e) => e.paymentStatus === "pending");
              if (!pending) return;
              const el = document.getElementById(`entitlement-${pending.id}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
                setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2"), 4000);
              }
            }}
            className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 p-4 text-left transition-shadow hover:shadow-lg active:shadow-md cursor-pointer"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <CreditCard className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white">Complete your payment</p>
              <p className="text-xs text-amber-100">Pending payment — complete to start booking</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/70 shrink-0" />
          </button>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => navigateTo("/catalog", "hero-getstarted")}
              disabled={loadingId === "hero-getstarted"}
              className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-bpm-600 to-bpm-500 p-4 text-left transition-shadow hover:shadow-lg active:shadow-md cursor-pointer"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-white">
                  {loadingId === "hero-getstarted" ? "Loading…" : "Get started"}
                </p>
                <p className="text-xs text-bpm-100">Buy a product to book classes</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/70 shrink-0" />
            </button>
            <button
              type="button"
              onClick={onboarding.open}
              className="text-xs font-medium text-bpm-600 hover:text-bpm-700 transition-colors px-1"
            >
              New here? See how it works
            </button>
          </div>
        )}

        {/* Quick actions — 2-col top row, optional full-width QR below */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigateTo("/catalog", "quick-products")}
              disabled={loadingId === "quick-products"}
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3.5 sm:py-2.5 text-center transition-colors hover:bg-emerald-100 active:bg-emerald-150"
            >
              <ShoppingBag className="h-5 w-5 sm:h-4 sm:w-4 text-emerald-700 shrink-0" />
              <span className="text-sm sm:text-xs font-semibold text-emerald-800">
                {loadingId === "quick-products" ? "…" : "Buy a product"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo("/classes", "quick-classes")}
              disabled={loadingId === "quick-classes"}
              className="flex items-center justify-center gap-2 rounded-lg border border-bpm-200 bg-bpm-50 px-3 py-3.5 sm:py-2.5 text-center transition-colors hover:bg-bpm-100 active:bg-bpm-150"
            >
              <Calendar className="h-5 w-5 sm:h-4 sm:w-4 text-bpm-700 shrink-0" />
              <span className="text-sm sm:text-xs font-semibold text-bpm-800">
                {loadingId === "quick-classes" ? "…" : "Book a class"}
              </span>
            </button>
          </div>

          {qrToken && (
            <button
              type="button"
              onClick={() => setShowQr(true)}
              data-tour="qr-button"
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3.5 sm:py-2.5 text-center transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <QrCode className="h-5 w-5 sm:h-4 sm:w-4 text-gray-500 shrink-0" />
              <span className="text-sm sm:text-xs font-medium text-gray-600">Show QR code</span>
            </button>
          )}
        </div>
      </div>

      {/* QR modal */}
      {showQr && qrToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowQr(false)}>
          <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowQr(false)}
              className="absolute top-3 right-3 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-4">
              <p className="text-lg font-bold text-gray-900">My Check-in QR</p>
              <div className="rounded-2xl border-2 border-bpm-100 bg-white p-4 shadow-sm">
                <QRCodeSVG value={qrToken} size={200} level="M" bgColor="#ffffff" fgColor="#1e1b4b" />
              </div>
              <p className="text-xs text-gray-400 text-center max-w-[220px]">
                Show this at reception when you arrive for class.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding walkthrough */}
      {onboarding.show && (
        <StudentWalkthrough onClose={onboarding.close} onDismiss={onboarding.dismiss} />
      )}

      {/* Stats */}
      <Link href="/bookings" className="flex items-center gap-4 rounded-md border border-gray-200 bg-white px-3 py-2.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-bpm-600" />
          <span className="text-lg font-bold text-gray-900">{upcomingBookings.length}</span>
          <span className="text-xs text-gray-500">upcoming</span>
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-lg font-bold text-gray-900">{waitlistedCount}</span>
          <span className="text-xs text-gray-500">waitlisted</span>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-gray-400 ml-auto" />
      </Link>

      {/* Today for you */}
      {todayForYou.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <Star className="h-3.5 w-3.5 text-amber-500" />
              Today for you
            </h2>
            <Link href="/classes" className="text-[11px] font-medium text-bpm-600 hover:text-bpm-700">
              View all
            </Link>
          </div>
          <div className="space-y-1.5">
            {todayForYou.map((c) => (
              <ClassListItem
                key={c.id}
                name={c.title}
                badges={
                  <>
                    {c.styleName && <InlineBadge>{c.styleName}</InlineBadge>}
                    {c.level && <InlineBadge className="bg-gray-100 text-gray-600">{c.level}</InlineBadge>}
                  </>
                }
                meta={
                  <RowMeta>
                    <span>{c.startTime}–{c.endTime}</span>
                    <MetaLocation>{c.location}</MetaLocation>
                    {c.spotsLeft !== null && c.spotsLeft <= 3 && c.spotsLeft > 0 && (
                      <span className="font-medium text-amber-600">{c.spotsLeft} left</span>
                    )}
                  </RowMeta>
                }
                action={
                  <ActionPill
                    variant={c.isWaitlist ? "waitlist" : "primary"}
                    onClick={() => setBookTarget(c)}
                  >
                    {c.isWaitlist ? "Waitlist" : "Book"}
                  </ActionPill>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Today-for-you booking dialog */}
      {bookTarget && (
        <StudentBookDialog
          cls={{
            id: bookTarget.id,
            title: bookTarget.title,
            date: bookTarget.date,
            startTime: bookTarget.startTime,
            endTime: bookTarget.endTime,
            location: bookTarget.location,
            styleName: bookTarget.styleName,
            level: bookTarget.level,
            danceStyleRequiresBalance: bookTarget.danceStyleRequiresBalance,
            spotsLeft: bookTarget.spotsLeft,
          }}
          entitlements={bookTarget.entitlements}
          autoSelected={bookTarget.autoSelected}
          isWaitlist={bookTarget.isWaitlist}
          waitlistReason={bookTarget.waitlistReason}
          defaultDanceRole={studentPreferredRole}
          onClose={() => setBookTarget(null)}
        />
      )}

      {/* Entitlements */}
      {entitlements.length > 0 && (
        <EntitlementsSection entitlements={entitlements} stripeEnabled={stripeEnabled} />
      )}

      {/* Last plan — shown when no active entitlements */}
      {entitlements.length === 0 && lastPlan && (
        <CompactRow>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-600">Your Last Plan</span>
              </div>
              <StatusPill status={lastPlan.status} />
            </div>
            <div>
              <RowTitle>{lastPlan.productName}</RowTitle>
              <div className="mt-0.5">
                <RowMeta>
                  <EntitlementBalance e={lastPlan} />
                  {lastPlan.termName && <span>{lastPlan.termName}</span>}
                  {lastPlan.selectedStyleName && (
                    <span className="text-bpm-600">{lastPlan.selectedStyleName}</span>
                  )}
                </RowMeta>
              </div>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <p className="text-[11px] text-amber-800">
                No active membership or pass. Browse our catalog to get started.
              </p>
            </div>
            <Link href="/catalog" className="block">
              <button className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                Browse Products
                <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
        </CompactRow>
      )}

      {/* Member Benefits */}
      {benefits?.isMember && (
        <div className="space-y-1.5">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">
            <Star className="h-3.5 w-3.5 text-bpm-500" />
            Member Benefits
          </h2>
          <div className="rounded-md border border-bpm-100 bg-bpm-50/30 divide-y divide-bpm-100/50">
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Cake className="h-3.5 w-3.5 text-bpm-400 shrink-0" />
              <span className="flex-1 text-xs font-medium text-gray-900 truncate">Birthday Free Class</span>
              <span className="shrink-0">
                {benefits.birthdayFreeClassUsed ? (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Used</span>
                ) : benefits.birthdayWeekEligible ? (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Available</span>
                ) : (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Not yet</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Gift className="h-3.5 w-3.5 text-bpm-400 shrink-0" />
              <span className="flex-1 text-xs font-medium text-gray-900">Giveaways</span>
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Eligible</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Music className="h-3.5 w-3.5 text-bpm-400 shrink-0" />
              <span className="flex-1 text-xs font-medium text-gray-900">Weekend Practice</span>
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Included</span>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming bookings */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            My Upcoming Classes
          </h2>
          <Link href="/bookings" className="text-[11px] font-medium text-bpm-600 hover:text-bpm-700">
            View all
          </Link>
        </div>
        {upcomingBookings.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 py-6 text-center">
            <Inbox className="mx-auto h-5 w-5 text-gray-300 mb-1" />
            <p className="text-xs text-gray-500">No upcoming bookings</p>
            <Link href="/classes" className="mt-1.5 inline-block text-xs font-medium text-bpm-600 hover:text-bpm-700">
              Browse classes
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5">
            {upcomingBookings.map((b) => (
              <BookingListItem
                key={b.id}
                border={b.status === "confirmed" ? "border-green-200" : "border-gray-200"}
                name={b.classTitle}
                badge={b.danceRole && b.danceStyleRequiresBalance ? <InlineBadge className="bg-gray-100 text-gray-600">{formatRoleLabel(b.danceRole)}</InlineBadge> : undefined}
                meta={
                  <RowMeta>
                    <span>{formatDate(b.date)}</span>
                    <span>{b.startTime}–{b.endTime}</span>
                    <MetaLocation>{b.location}</MetaLocation>
                  </RowMeta>
                }
                status={<StatusPill status={b.status} icon />}
              />
            ))}
          </div>
        )}
      </div>

      {/* Penalties hidden from student view — managed by admin only */}
    </div>
  );
}

const HISTORY_PREVIEW_COUNT = 3;
const HISTORY_PAGE_SIZE = 5;

function EntitlementsSection({
  entitlements,
  stripeEnabled,
}: {
  entitlements: StudentEntitlementSummary[];
  stripeEnabled: boolean;
}) {
  const activeEntitlements = entitlements.filter((e) => e.status === "active");
  const historyEntitlements = entitlements.filter((e) => e.status !== "active");
  const [sectionOpen, setSectionOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PREVIEW_COUNT);

  const visibleHistory = historyEntitlements.slice(0, visibleCount);
  const hasMore = visibleCount < historyEntitlements.length;
  const remaining = historyEntitlements.length - visibleCount;

  return (
    <div className="space-y-3">
      {activeEntitlements.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <CreditCard className="h-3.5 w-3.5 text-gray-400" />
              Active Entitlements
            </h2>
            <span className="text-[10px] text-gray-400">{activeEntitlements.length}</span>
          </div>
          <div className="space-y-1">
            {activeEntitlements.map((e) => (
              <EntitlementRow key={e.id} e={e} stripeEnabled={stripeEnabled} />
            ))}
          </div>
        </div>
      )}

      {historyEntitlements.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setSectionOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <History className="h-3.5 w-3.5 text-gray-400" />
              Past Entitlements ({historyEntitlements.length})
            </span>
            {sectionOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>
          {sectionOpen && (
            <>
              <div className="space-y-1">
                {visibleHistory.map((e) => (
                  <EntitlementRow key={e.id} e={e} stripeEnabled={stripeEnabled} />
                ))}
              </div>
              {hasMore && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + HISTORY_PAGE_SIZE)}
                    className="text-xs font-medium text-bpm-600 hover:text-bpm-700"
                  >
                    Load more ({remaining} older)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EntitlementRow({
  e,
  stripeEnabled,
}: {
  e: StudentEntitlementSummary;
  stripeEnabled: boolean;
}) {
  return (
    <div id={`entitlement-${e.id}`} className="transition-all duration-300">
      <CompactRow>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <RowTitle>{e.productName}</RowTitle>
            <InlineBadge className={
              e.isFutureTerm
                ? "bg-blue-50 text-bpm-700"
                : e.status === "active"
                  ? "bg-green-50 text-green-700"
                  : "bg-gray-100 text-gray-600"
            }>
              {e.isFutureTerm ? "Scheduled" : e.status === "active" ? "Active" : e.status}
            </InlineBadge>
            {e.paymentStatus === "paid" && (
              <InlineBadge className="bg-emerald-50 text-emerald-700">Paid</InlineBadge>
            )}
            {e.paymentStatus === "complimentary" && (
              <InlineBadge className="bg-emerald-50 text-emerald-700">Free</InlineBadge>
            )}
            {e.paymentStatus === "pending" && (
              <InlineBadge className="bg-amber-50 text-amber-700">Payment due</InlineBadge>
            )}
            {e.paymentStatus && !["paid", "complimentary", "pending"].includes(e.paymentStatus) && (
              <InlineBadge className={
                e.paymentStatus === "cancelled" || e.paymentStatus === "refunded"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }>
                {e.paymentStatus === "waived" && "Waived"}
                {e.paymentStatus === "cancelled" && "Cancelled"}
                {e.paymentStatus === "refunded" && "Refunded"}
              </InlineBadge>
            )}
            {e.isRenewal && (
              <InlineBadge className="bg-bpm-50 text-bpm-700">Renewal</InlineBadge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
            {e.selectedStyleName && (
              <span className="text-bpm-600 font-medium">{e.selectedStyleName}</span>
            )}
            {e.isFutureTerm ? (
              <span>Starts {formatDate(e.validFrom)}{e.termName ? ` · ${e.termName}` : ""}</span>
            ) : (
              <>
                <EntitlementBalance e={e} />
                {e.termName && <span>{e.termName}</span>}
              </>
            )}
            {e.daysUntilExpiry !== null && e.daysUntilExpiry <= 7 && e.daysUntilExpiry >= 0 && (
              <span className={`font-medium ${e.daysUntilExpiry <= 2 ? "text-red-600" : "text-amber-600"}`}>
                {e.daysUntilExpiry === 0
                  ? "Expires today"
                  : e.daysUntilExpiry === 1
                    ? "Expires tomorrow"
                    : `${e.daysUntilExpiry}d left`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {e.canToggleAutoRenew ? (
            <AutoRenewToggle subscriptionId={e.id} initial={e.autoRenew} />
          ) : e.autoRenew ? (
            <span
              title="Renews at end of term — no automatic charge"
              className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Auto
            </span>
          ) : null}
        </div>
      </div>
      {e.paymentStatus === "pending" && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 space-y-1.5">
          <p className="text-[11px] font-medium text-amber-800">Payment is due for this plan.</p>
          <div className="flex flex-wrap items-center gap-2">
            {stripeEnabled && (
              <PayRenewalButton subscriptionId={e.id} productName={e.productName} />
            )}
            <span className="text-[11px] text-gray-600">
              {stripeEnabled ? "or pay at reception" : "Pay at reception (cash / Revolut)"}
            </span>
          </div>
        </div>
      )}
      </CompactRow>
    </div>
  );
}

function EntitlementBalance({ e }: { e: StudentEntitlementSummary }) {
  if (e.classesPerTerm !== null) {
    const left = Math.max(0, e.classesPerTerm - e.classesUsed);
    return (
      <span className="font-medium text-gray-700">
        {e.classesUsed} / {e.classesPerTerm} classes used · {left} remaining
      </span>
    );
  }
  if (e.remainingCredits !== null && e.totalCredits !== null) {
    const used = e.totalCredits - e.remainingCredits;
    return (
      <span className="font-medium text-gray-700">
        {used} / {e.totalCredits} credits used · {e.remainingCredits} remaining
      </span>
    );
  }
  if (e.remainingCredits !== null) {
    return (
      <span className="font-medium text-gray-700">
        {e.remainingCredits} credit{e.remainingCredits !== 1 ? "s" : ""} remaining
      </span>
    );
  }
  return <span className="text-gray-400">Unlimited</span>;
}

function CocBanner() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
        <ScrollText className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-900">Code of Conduct Required</p>
          <p className="text-[10px] text-amber-700">Review and accept before booking.</p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          Review
        </button>
      </div>
      {showDialog && (
        <CocAcceptanceDialog
          onClose={() => setShowDialog(false)}
          onAccepted={() => setShowDialog(false)}
        />
      )}
    </>
  );
}

function formatBirthday(dob: string): string {
  const parts = dob.split("-");
  if (parts.length === 2 && /^\d{2}$/.test(parts[0])) {
    const m = parseInt(parts[0], 10) - 1;
    const d = parseInt(parts[1], 10);
    return `${d} ${new Date(2000, m).toLocaleString("en", { month: "long" })}`;
  }
  return dob;
}

function ProfileCard({
  dateOfBirth,
  preferredRole,
}: {
  dateOfBirth: string | null;
  preferredRole: DanceRole | null;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<string>(preferredRole ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateOwnPreferredRoleAction(role);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <User className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-xs font-semibold text-gray-600">My Profile</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <p className="text-[10px] text-gray-400">Birthday</p>
          <p className="text-xs font-medium text-gray-900">
            {dateOfBirth ? formatBirthday(dateOfBirth) : "Not set"}
          </p>
        </div>
        <div className="h-6 w-px bg-gray-200 hidden sm:block" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400">Preferred Role</p>
          {editing ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-bpm-500 focus:outline-none focus:ring-1 focus:ring-bpm-100"
              >
                <option value="">No preference</option>
                <option value="leader">Leader</option>
                <option value="follower">Follower</option>
              </select>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-bpm-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-bpm-700 disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                onClick={() => { setRole(preferredRole ?? ""); setEditing(false); }}
                className="text-[10px] text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-gray-900">
                {preferredRole
                  ? preferredRole.charAt(0).toUpperCase() + preferredRole.slice(1)
                  : "Not set"}
              </p>
              <button
                onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-bpm-600 transition-colors"
                aria-label="Edit preferred role"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoRenewToggle({ subscriptionId, initial }: { subscriptionId: string; initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await toggleAutoRenewAction(subscriptionId, next);
        if (!res.success) {
          setEnabled(!next);
          setError(res.error ?? "Failed to update");
        }
      } catch {
        setEnabled(!next);
        setError("Failed to update");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={enabled
        ? "Auto-renew is ON — your plan will be renewed for the next term (no automatic charge). Click to turn off."
        : "Auto-renew is OFF — click to enable renewal for the next term."}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset transition-colors ${
        enabled
          ? "bg-green-50 text-green-700 ring-green-600/20"
          : "bg-gray-50 text-gray-500 ring-gray-300"
      } ${isPending ? "opacity-50" : "hover:opacity-80 cursor-pointer"}`}
    >
      <RefreshCw className={`h-3 w-3 ${enabled ? "text-green-500" : "text-gray-400"}`} />
      {enabled ? "Auto-renew on" : "Auto-renew off"}
      {error && <span className="sr-only">{error}</span>}
    </button>
  );
}

function PayRenewalButton({ subscriptionId, productName }: { subscriptionId: string; productName: string }) {
  const [isPending, startTransition] = useTransition();

  function handlePay() {
    startTransition(async () => {
      const res = await payPendingSubscriptionAction(subscriptionId);
      if (res.success && res.url) {
        window.location.href = res.url;
      }
    });
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handlePay}
      disabled={isPending}
      className="text-xs"
    >
      {isPending ? "Redirecting…" : "Pay online"}
    </Button>
  );
}
