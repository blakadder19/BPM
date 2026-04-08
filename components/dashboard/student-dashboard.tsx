"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarPlus,
  Calendar,
  MapPin,
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
  CheckCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CocAcceptanceDialog } from "@/components/booking/coc-acceptance-dialog";
import {
  StudentBookDialog,
  type BookDialogClass,
} from "@/components/booking/student-book-dialog";
import { updateOwnPreferredRoleAction } from "@/lib/actions/students";
import { toggleAutoRenewAction } from "@/lib/actions/catalog-purchase";
import { payPendingSubscriptionAction } from "@/lib/actions/stripe-checkout";
import { formatDate } from "@/lib/utils";
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
  status: string;
}

export interface StudentPenaltySummary {
  id: string;
  classTitle: string;
  date: string;
  reason: string;
  amountCents: number;
  resolution: string;
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
  penalties: StudentPenaltySummary[];
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
  penalties,
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

  const [bookTarget, setBookTarget] = useState<TodayForYouItem | null>(null);

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
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your dance classes at a glance."
      />

      {/* Current Term Banner */}
      {termInfo && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900">{termInfo.name}</p>
              <p className="text-xs text-blue-700">
                Week {termInfo.weekNumber} · {formatDate(termInfo.startDate)} – {formatDate(termInfo.endDate)}
              </p>
            </div>
          </CardContent>
        </Card>
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

      {/* Book a Class — Hero CTA */}
      <Link href="/classes" className="block">
        <Card className="border-indigo-200 bg-gradient-to-r from-indigo-600 to-indigo-500 transition-shadow hover:shadow-lg active:shadow-md">
          <CardContent className="flex items-center gap-4 p-4 sm:p-5">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <CalendarPlus className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-lg font-bold text-white">Book a Class</p>
              <p className="text-sm text-indigo-100">Browse this week&apos;s schedule and sign up</p>
            </div>
            <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 text-white/80 shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Link href="/bookings">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {upcomingBookings.length}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 truncate">Upcoming</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/bookings">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {waitlistedCount}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 truncate">Waitlisted</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Today for you */}
      {todayForYou.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Star className="h-5 w-5 text-amber-500" />
              Today for you
            </CardTitle>
            <Link
              href="/classes"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 shrink-0"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {todayForYou.map((c) => (
                <div key={c.id} className="px-4 sm:px-6 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-1">
                        <span>{c.startTime}–{c.endTime}</span>
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" /> {c.location}
                        </span>
                        {c.styleName && (
                          <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                            {c.styleName}
                          </span>
                        )}
                        {c.level && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {c.level}
                          </span>
                        )}
                        {c.spotsLeft !== null && c.spotsLeft <= 3 && c.spotsLeft > 0 && (
                          <span className="text-xs font-medium text-amber-600">
                            {c.spotsLeft} left
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={c.isWaitlist ? "secondary" : "primary"}
                      className="shrink-0"
                      onClick={() => setBookTarget(c)}
                    >
                      {c.isWaitlist ? "Waitlist" : "Book"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-gray-400" />
              My Entitlements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {entitlements.map((e) => (
                <div key={e.id} id={`entitlement-${e.id}`} className="px-4 sm:px-6 py-3 transition-all duration-300 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {e.productName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                        <StatusBadge status={e.productType} />
                        <StatusBadge status={e.isFutureTerm ? "scheduled" : e.status} />
                        {e.paymentStatus === "paid" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            <CheckCircle className="h-3 w-3" />
                            Paid
                          </span>
                        )}
                        {e.paymentStatus === "complimentary" && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Complimentary
                          </span>
                        )}
                        {e.paymentStatus && e.paymentStatus !== "paid" && e.paymentStatus !== "complimentary" && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            e.paymentStatus === "cancelled" || e.paymentStatus === "refunded"
                              ? "bg-red-50 text-red-700 ring-red-600/20"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20"
                          }`}>
                            {e.paymentStatus === "pending" && "Payment pending"}
                            {e.paymentStatus === "waived" && "Payment waived"}
                            {e.paymentStatus === "cancelled" && "Payment cancelled"}
                            {e.paymentStatus === "refunded" && "Refunded"}
                          </span>
                        )}
                        {e.daysUntilExpiry !== null && e.daysUntilExpiry <= 7 && e.daysUntilExpiry >= 0 && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            e.daysUntilExpiry <= 2
                              ? "bg-red-50 text-red-700 ring-red-600/20"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20"
                          }`}>
                            {e.daysUntilExpiry === 0
                              ? "Expires today"
                              : e.daysUntilExpiry === 1
                                ? "Expires tomorrow"
                                : `Expires in ${e.daysUntilExpiry} days`}
                          </span>
                        )}
                        {e.selectedStyleName && (
                          <span className="text-indigo-600">{e.selectedStyleName}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {e.isRenewal && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                          Renewal
                        </span>
                      )}
                      {e.canToggleAutoRenew ? (
                        <AutoRenewToggle subscriptionId={e.id} initial={e.autoRenew} />
                      ) : e.autoRenew ? (
                        <span
                          title="Renews at end of term — no automatic charge"
                          className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20"
                        >
                          <RefreshCw className="h-3 w-3 text-green-500" />
                          Auto-renew on
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {e.isFutureTerm ? (
                      <span className="font-medium text-gray-600">
                        Starts {formatDate(e.validFrom)}
                        {e.termName ? ` · ${e.termName}` : ""}
                      </span>
                    ) : (
                      <>
                        <EntitlementBalance e={e} />
                        {e.termName && <span>Term: {e.termName}</span>}
                      </>
                    )}
                    <span>
                      {formatDate(e.validFrom)}
                      {e.validUntil ? ` – ${formatDate(e.validUntil)}` : " – no end date"}
                    </span>
                  </div>
                  {e.paymentStatus === "pending" && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-medium text-amber-800">
                        Payment is due for this plan.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {stripeEnabled && (
                          <PayRenewalButton subscriptionId={e.id} productName={e.productName} />
                        )}
                        <span className="text-xs text-gray-600">
                          {stripeEnabled ? "or pay at reception (cash / Revolut)" : "Please pay at reception (cash / Revolut)"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last plan — shown when no active entitlements */}
      {entitlements.length === 0 && lastPlan && (
        <Card className="border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-gray-600">
              <CreditCard className="h-5 w-5 text-gray-400" />
              Your Last Plan
            </CardTitle>
            <StatusBadge status={lastPlan.status} />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{lastPlan.productName}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                <StatusBadge status={lastPlan.productType} />
                {lastPlan.selectedStyleName && (
                  <span className="text-indigo-600">{lastPlan.selectedStyleName}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <EntitlementBalance e={lastPlan} />
              {lastPlan.termName && <span>Term: {lastPlan.termName}</span>}
              <span>
                {formatDate(lastPlan.validFrom)}
                {lastPlan.validUntil ? ` – ${formatDate(lastPlan.validUntil)}` : ""}
              </span>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs text-amber-800">
                You don&apos;t have an active membership or pass. Browse our catalog to get started again.
              </p>
            </div>
            <Link href="/catalog">
              <Button variant="outline" size="sm" className="w-full gap-1.5">
                Browse Memberships & Passes
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Member Benefits */}
      {benefits?.isMember && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-indigo-500" />
              Member Benefits
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-indigo-100">
              <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
                <Cake className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Birthday Week Free Class</p>
                  <p className="text-xs text-gray-500 hidden sm:block">One free class during your birthday week</p>
                </div>
                <span className="shrink-0">
                  {benefits.birthdayFreeClassUsed ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Used{benefits.birthdayClassTitle ? ` · ${benefits.birthdayClassTitle}` : ""}
                    </span>
                  ) : benefits.birthdayWeekEligible ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Available</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Not yet</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
                <Gift className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Member Giveaways</p>
                  <p className="text-xs text-gray-500 hidden sm:block">Eligible for exclusive member giveaways</p>
                </div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Eligible
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
                <Music className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Free Weekend Practice</p>
                  <p className="text-xs text-gray-500 hidden sm:block">Free access to weekend practice sessions</p>
                </div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Included
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student QR Identity */}
      {qrToken && <StudentQrCard qrToken={qrToken} />}

      {/* Upcoming bookings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="h-5 w-5 text-gray-400" />
            My Upcoming Classes
          </CardTitle>
          <Link
            href="/bookings"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 shrink-0"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {upcomingBookings.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No upcoming bookings"
              description="You haven't booked any classes yet."
              action={
                <Link href="/classes">
                  <Button>Browse classes</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {upcomingBookings.map((b) => (
                <div
                  key={b.id}
                  className="px-4 sm:px-6 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {b.classTitle}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {b.danceRole && <StatusBadge status={b.danceRole} />}
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-1">
                    <span>{formatDate(b.date)}</span>
                    <span>
                      {b.startTime}–{b.endTime}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" /> {b.location}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Penalties hidden from student view — managed by admin only */}
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
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <ScrollText className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Code of Conduct Required</p>
              <p className="text-xs text-amber-700">
                Please review and accept before booking classes.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowDialog(true)} className="w-full sm:w-auto shrink-0">
            Review & Accept
          </Button>
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <User className="h-5 w-5 text-gray-400" />
          My Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Birthday</p>
            <p className="text-sm font-medium text-gray-900">
              {dateOfBirth ? formatBirthday(dateOfBirth) : "Not set"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">Preferred Dance Role</p>
            {editing ? (
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">No preference</option>
                  <option value="leader">Leader</option>
                  <option value="follower">Follower</option>
                </select>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRole(preferredRole ?? "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm font-medium text-gray-900">
                  {preferredRole
                    ? preferredRole.charAt(0).toUpperCase() + preferredRole.slice(1)
                    : "Not set"}
                </p>
                <button
                  onClick={() => setEditing(true)}
                  className="text-gray-400 hover:text-indigo-600 transition-colors"
                  aria-label="Edit preferred role"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentQrCard({ qrToken }: { qrToken: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-50 transition-colors hover:bg-indigo-100"
          aria-label="Show check-in QR code"
        >
          {expanded ? (
            <QRCodeSVG value={qrToken} size={44} level="M" bgColor="transparent" fgColor="#312e81" />
          ) : (
            <QrCode className="h-7 w-7 text-indigo-600" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">My Check-in QR</p>
          <p className="text-xs text-gray-500">
            Show this at reception when you arrive for class.
          </p>
        </div>
        <Button
          size="sm"
          variant={expanded ? "ghost" : "outline"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide" : "Show QR"}
        </Button>
      </CardContent>

      {expanded && (
        <div className="border-t border-gray-100 px-6 py-5 flex flex-col items-center gap-3">
          <div className="rounded-2xl border-2 border-indigo-100 bg-white p-4 shadow-sm">
            <QRCodeSVG
              value={qrToken}
              size={180}
              level="M"
              bgColor="#ffffff"
              fgColor="#1e1b4b"
            />
          </div>
          <p className="text-[11px] text-gray-400 text-center max-w-[200px]">
            Staff will scan this to verify your booking and check you in.
          </p>
        </div>
      )}
    </Card>
  );
}

function AutoRenewToggle({ subscriptionId, initial }: { subscriptionId: string; initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await toggleAutoRenewAction(subscriptionId, next);
      if (!res.success) setEnabled(!next);
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
