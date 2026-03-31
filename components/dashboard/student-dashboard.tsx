"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarPlus,
  AlertTriangle,
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
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CocAcceptanceDialog } from "@/components/booking/coc-acceptance-dialog";
import { formatDate, formatCents } from "@/lib/utils";
import type { MemberBenefitsSummary } from "@/lib/domain/member-benefits";
import type { ProductType } from "@/types/domain";

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
  termName: string | null;
  selectedStyleName: string | null;
  validFrom: string;
  validUntil: string | null;
  paymentStatus: string | null;
}

interface StudentDashboardProps {
  fullName: string;
  upcomingBookings: StudentBookingSummary[];
  penalties: StudentPenaltySummary[];
  termInfo?: StudentTermInfo | null;
  entitlements?: StudentEntitlementSummary[];
  waitlistedCount?: number;
  codeOfConductAccepted?: boolean;
  benefits?: MemberBenefitsSummary | null;
  qrToken?: string | null;
}

export function StudentDashboard({
  fullName,
  upcomingBookings,
  penalties,
  termInfo,
  entitlements = [],
  waitlistedCount = 0,
  codeOfConductAccepted,
  benefits,
  qrToken,
}: StudentDashboardProps) {
  const firstName = fullName.split(" ")[0];
  const unresolvedPenalties = penalties.filter(
    (p) => p.resolution === "monetary_pending"
  );

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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
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
                <p className="text-xs sm:text-sm text-gray-500">Upcoming</p>
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
                <p className="text-xs sm:text-sm text-gray-500">Waitlisted</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/classes">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                <CalendarPlus className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">Book a Class</p>
                <p className="text-xs text-gray-500">Browse & sign up</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-red-50">
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold text-gray-900">
                {unresolvedPenalties.length}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">Penalties</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
                <div key={e.id} className="px-4 sm:px-6 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {e.productName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                        <StatusBadge status={e.productType} />
                        <StatusBadge status={e.status} />
                        {e.paymentStatus === "pending" && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Payment pending
                          </span>
                        )}
                        {e.selectedStyleName && (
                          <span className="text-indigo-600">{e.selectedStyleName}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {e.autoRenew && (
                        <span title="Auto-renew">
                          <RefreshCw className="h-3.5 w-3.5 text-green-500" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <EntitlementBalance e={e} />
                    {e.termName && <span>Term: {e.termName}</span>}
                    <span>
                      {formatDate(e.validFrom)}
                      {e.validUntil ? ` – ${formatDate(e.validUntil)}` : " – no end date"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
                  {benefits.birthdayWeekEligible ? (
                    benefits.birthdayFreeClassUsed ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Used</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Available</span>
                    )
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

      {/* Penalties summary */}
      {penalties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-gray-400" />
              Penalties
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {penalties.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="px-4 sm:px-6 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.classTitle}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-medium text-gray-700">
                        {formatCents(p.amountCents)}
                      </span>
                      <StatusBadge status={p.resolution} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <span>{formatDate(p.date)}</span>
                    <StatusBadge status={p.reason} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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
