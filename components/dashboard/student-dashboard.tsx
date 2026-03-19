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
} from "lucide-react";
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
  classesUsed: number;
  classesPerTerm: number | null;
  remainingCredits: number | null;
  totalCredits: number | null;
  autoRenew: boolean;
  termName: string | null;
  selectedStyleName: string | null;
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
          <CardContent className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Link href="/bookings">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {upcomingBookings.length}
                </p>
                <p className="text-sm text-gray-500">Upcoming</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/bookings">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {waitlistedCount}
                </p>
                <p className="text-sm text-gray-500">Waitlisted</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/classes">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                <CalendarPlus className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Book a Class</p>
                <p className="text-xs text-gray-500">Browse and sign up</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/penalties">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {unresolvedPenalties.length}
                </p>
                <p className="text-sm text-gray-500">Open penalties</p>
              </div>
            </CardContent>
          </Card>
        </Link>
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
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {e.productName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <StatusBadge status={e.productType} />
                      {e.termName && <span>{e.termName}</span>}
                      {e.selectedStyleName && (
                        <span className="text-indigo-600">{e.selectedStyleName}</span>
                      )}
                    </div>
                    {e.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{e.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.productType === "membership" && e.classesPerTerm !== null && (
                      <span className="text-sm font-medium text-gray-700">
                        Used {e.classesUsed} / {e.classesPerTerm} · {e.classesPerTerm - e.classesUsed} left
                      </span>
                    )}
                    {e.productType !== "membership" && e.remainingCredits !== null && e.totalCredits !== null && (
                      <span className="text-sm font-medium text-gray-700">
                        Used {e.totalCredits - e.remainingCredits} / {e.totalCredits} · {e.remainingCredits} left
                      </span>
                    )}
                    {e.productType !== "membership" && e.remainingCredits !== null && e.totalCredits === null && (
                      <span className="text-sm font-medium text-gray-700">
                        {e.remainingCredits} credit{e.remainingCredits !== 1 ? "s" : ""} left
                      </span>
                    )}
                    {e.autoRenew && (
                      <span title="Auto-renew">
                        <RefreshCw className="h-3.5 w-3.5 text-green-500" />
                      </span>
                    )}
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
              <div className="flex items-center gap-3 px-6 py-3">
                <Cake className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Birthday Week Free Class</p>
                  <p className="text-xs text-gray-500">One free class during your birthday week</p>
                </div>
                <span className="shrink-0">
                  {benefits.birthdayWeekEligible ? (
                    benefits.birthdayFreeClassUsed ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Used</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Available now</span>
                    )
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">Not birthday week</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 px-6 py-3">
                <Gift className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Member Giveaways</p>
                  <p className="text-xs text-gray-500">Eligible for exclusive member giveaways</p>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Eligible
                </span>
              </div>
              <div className="flex items-center gap-3 px-6 py-3">
                <Music className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Free Weekend Student Practice</p>
                  <p className="text-xs text-gray-500">Free access to weekend practice sessions</p>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Included
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming bookings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            My Upcoming Classes
          </CardTitle>
          <Link
            href="/bookings"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
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
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {b.classTitle}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatDate(b.date)}</span>
                      <span>
                        {b.startTime}–{b.endTime}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> {b.location}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.danceRole && <StatusBadge status={b.danceRole} />}
                    <StatusBadge status={b.status} />
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-gray-400" />
              Penalties
            </CardTitle>
            <Link
              href="/penalties"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {penalties.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.classTitle}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatDate(p.date)}</span>
                      <StatusBadge status={p.reason} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-gray-700">
                      {formatCents(p.amountCents)}
                    </span>
                    <StatusBadge status={p.resolution} />
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

function CocBanner() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <ScrollText className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Code of Conduct Required</p>
            <p className="text-xs text-amber-700">
              Please review and accept the Code of Conduct before booking any classes.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowDialog(true)}>
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
