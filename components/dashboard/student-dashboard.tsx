"use client";

import Link from "next/link";
import {
  BookOpen,
  CalendarPlus,
  AlertTriangle,
  Calendar,
  MapPin,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate, formatCents } from "@/lib/utils";

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

interface StudentDashboardProps {
  fullName: string;
  upcomingBookings: StudentBookingSummary[];
  penalties: StudentPenaltySummary[];
}

export function StudentDashboard({
  fullName,
  upcomingBookings,
  penalties,
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

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <p className="text-sm text-gray-500">Upcoming bookings</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/bookings/new">
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
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
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
                <Link href="/bookings/new">
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
