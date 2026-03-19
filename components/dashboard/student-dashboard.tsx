"use client";

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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate, formatCents } from "@/lib/utils";
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
  classesUsed: number;
  classesPerTerm: number | null;
  remainingCredits: number | null;
  totalCredits: number | null;
  autoRenew: boolean;
  termName: string | null;
}

interface StudentDashboardProps {
  fullName: string;
  upcomingBookings: StudentBookingSummary[];
  penalties: StudentPenaltySummary[];
  termInfo?: StudentTermInfo | null;
  entitlements?: StudentEntitlementSummary[];
  waitlistedCount?: number;
}

export function StudentDashboard({
  fullName,
  upcomingBookings,
  penalties,
  termInfo,
  entitlements = [],
  waitlistedCount = 0,
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.productType === "membership" && e.classesPerTerm !== null && (
                      <span className="text-sm font-medium text-gray-700">
                        {e.classesPerTerm - e.classesUsed} / {e.classesPerTerm} left
                      </span>
                    )}
                    {e.productType !== "membership" && e.remainingCredits !== null && (
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
