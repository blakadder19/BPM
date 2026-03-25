"use client";

import Link from "next/link";
import {
  Calendar,
  BookOpen,
  Clock as ClockIcon,
  AlertTriangle,
  Users,
  TrendingUp,
  BarChart3,
  UserCheck,
  Package,
  ArrowRight,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatShortDate, formatCents, cn } from "@/lib/utils";
import type { EffectiveInstanceStatus } from "@/types/domain";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Serializable prop types (computed server-side) ───────────

export interface DashboardClassSummary {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  status: EffectiveInstanceStatus;
  maxCapacity: number | null;
  bookedCount: number;
  waitlistCount: number;
  leaderCap: number | null;
  followerCap: number | null;
  leaderCount: number;
  followerCount: number;
  styleName: string | null;
}

export interface DashboardDemandItem extends DashboardClassSummary {
  fillRate: number;
}

export interface AdminDashboardData {
  todayStr: string;
  todaysClassCount: number;
  upcomingBookingCount: number;
  activeWaitlistCount: number;
  unresolvedPenaltyCount: number;
  unresolvedPenaltyTotal: number;
  upcomingClasses: DashboardClassSummary[];
  demandClasses: DashboardDemandItem[];
  partnerClasses: DashboardClassSummary[];
  attendanceTotals: { present: number; late: number; absent: number; excused: number };
  attendanceTotal: number;
  byWeekday: number[];
  maxWeekday: number;
  subsByType: Record<string, number>;
  studentsWithSub: number;
  totalStudents: number;
  totalProducts: number;
}

// ── Page ────────────────────────────────────────────────────

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const d = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Overview as of ${formatDate(d.todayStr)}`}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Today's Classes"
          value={d.todaysClassCount}
          icon={Calendar}
          color="text-indigo-600"
          bg="bg-indigo-50"
          href="/classes/bookable"
        />
        <KpiCard
          label="Upcoming Bookings"
          value={d.upcomingBookingCount}
          icon={BookOpen}
          color="text-blue-600"
          bg="bg-blue-50"
          href="/bookings"
        />
        <KpiCard
          label="Active Waitlists"
          value={d.activeWaitlistCount}
          icon={Users}
          color="text-amber-600"
          bg="bg-amber-50"
          href="/classes/bookable"
        />
        <KpiCard
          label="Unresolved Penalties"
          value={d.unresolvedPenaltyCount}
          subtext={d.unresolvedPenaltyTotal > 0 ? formatCents(d.unresolvedPenaltyTotal) : undefined}
          icon={AlertTriangle}
          color="text-red-600"
          bg="bg-red-50"
          href="/penalties"
          urgent={d.unresolvedPenaltyCount > 0}
        />
      </div>

      {/* Row 2: Upcoming classes + Highest demand */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingClassesCard classes={d.upcomingClasses} />
        <HighestDemandCard classes={d.demandClasses} />
      </div>

      {/* Row 3: Role balance + Attendance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RoleBalanceCard classes={d.partnerClasses} />
        <AttendanceSummaryCard
          totals={d.attendanceTotals}
          total={d.attendanceTotal}
        />
      </div>

      {/* Row 4: Weekday distribution + Subscriptions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BookingsByWeekdayCard
          data={d.byWeekday}
          max={d.maxWeekday}
        />
        <SubscriptionsCard
          subsByType={d.subsByType}
          studentsWithSub={d.studentsWithSub}
          totalStudents={d.totalStudents}
          totalProducts={d.totalProducts}
        />
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  color,
  bg,
  href,
  urgent,
}: {
  label: string;
  value: number;
  subtext?: string;
  icon: typeof Calendar;
  color: string;
  bg: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className={cn("transition-shadow hover:shadow-md", urgent && "ring-1 ring-red-200")}>
        <CardContent className="flex items-center gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-lg", bg)}>
            <Icon className={cn("h-6 w-6", color)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 truncate">{label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              {subtext && (
                <span className="text-sm font-medium text-gray-500">{subtext}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Upcoming classes ────────────────────────────────────────

function UpcomingClassesCard({ classes }: { classes: DashboardClassSummary[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-gray-400" />
          Upcoming Classes
        </CardTitle>
        <Link
          href="/classes/bookable"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {classes.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            No upcoming classes scheduled.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {classes.map((bc) => {
              const fill =
                bc.maxCapacity && bc.maxCapacity > 0
                  ? Math.round((bc.bookedCount / bc.maxCapacity) * 100)
                  : null;
              return (
                <div
                  key={bc.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {bc.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatShortDate(bc.date)}</span>
                      <span>{bc.startTime}–{bc.endTime}</span>
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> {bc.location}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {bc.waitlistCount > 0 && (
                      <Badge variant="warning">{bc.waitlistCount} WL</Badge>
                    )}
                    <span className="text-sm tabular-nums text-gray-700">
                      {bc.bookedCount}/{bc.maxCapacity ?? "∞"}
                    </span>
                    {fill !== null && (
                      <div className="hidden sm:block w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            fill >= 90 ? "bg-red-400" : fill >= 60 ? "bg-amber-400" : "bg-emerald-400"
                          )}
                          style={{ width: `${Math.min(fill, 100)}%` }}
                        />
                      </div>
                    )}
                    <StatusBadge status={bc.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Highest demand ──────────────────────────────────────────

function HighestDemandCard({ classes }: { classes: DashboardDemandItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gray-400" />
          Highest Demand
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {classes.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            No class data available yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {classes.map((bc) => {
              const pct = Math.round(bc.fillRate * 100);
              return (
                <div key={bc.id} className="px-6 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {bc.title}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">
                        {formatShortDate(bc.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {bc.waitlistCount > 0 && (
                        <Badge variant="warning">{bc.waitlistCount} WL</Badge>
                      )}
                      <span className="text-sm font-semibold tabular-nums text-gray-700">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        pct >= 90 ? "bg-red-400" : pct >= 60 ? "bg-amber-400" : "bg-emerald-400"
                      )}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {bc.bookedCount} / {bc.maxCapacity} booked
                    {bc.styleName && <> &middot; {bc.styleName}</>}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Leader / follower balance ───────────────────────────────

function RoleBalanceCard({ classes }: { classes: DashboardClassSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-400" />
          Leader / Follower Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {classes.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            No partner class bookings to display.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {classes.map((bc) => {
              const total = bc.leaderCount + bc.followerCount;
              const leaderPct = total > 0 ? (bc.leaderCount / total) * 100 : 50;
              const followerPct = total > 0 ? (bc.followerCount / total) * 100 : 50;
              const diff = Math.abs(bc.leaderCount - bc.followerCount);
              const balanced = diff <= 1;

              return (
                <div key={bc.id} className="px-6 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {bc.title}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatShortDate(bc.date)}
                    </span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                    <div
                      className="bg-blue-400 transition-all"
                      style={{ width: `${leaderPct}%` }}
                      title={`Leaders: ${bc.leaderCount}`}
                    />
                    <div
                      className="bg-amber-400 transition-all"
                      style={{ width: `${followerPct}%` }}
                      title={`Followers: ${bc.followerCount}`}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-blue-600 font-medium">
                      {bc.leaderCount}L / {bc.leaderCap}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        balanced ? "text-emerald-600" : "text-amber-600"
                      )}
                    >
                      {balanced ? "Balanced" : `${diff} off`}
                    </span>
                    <span className="text-amber-600 font-medium">
                      {bc.followerCount}F / {bc.followerCap}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Attendance summary ──────────────────────────────────────

function AttendanceSummaryCard({
  totals,
  total,
}: {
  totals: { present: number; late: number; absent: number; excused: number };
  total: number;
}) {
  const rows = [
    { label: "Present", count: totals.present, color: "bg-emerald-400" },
    { label: "Late", count: totals.late, color: "bg-amber-400" },
    { label: "Absent", count: totals.absent, color: "bg-red-400" },
    { label: "Excused", count: totals.excused, color: "bg-blue-400" },
  ];
  const attendanceRate =
    total > 0
      ? Math.round(((totals.present + totals.late) / total) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-gray-400" />
          Attendance Summary
        </CardTitle>
        <Link
          href="/attendance"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            No attendance records yet.
          </p>
        ) : (
          <>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">
                {attendanceRate}%
              </span>
              <span className="text-sm text-gray-500">
                attendance rate ({total} records)
              </span>
            </div>

            <div className="flex h-3 rounded-full overflow-hidden mb-4">
              {rows.map(
                (r) =>
                  r.count > 0 && (
                    <div
                      key={r.label}
                      className={r.color}
                      style={{ width: `${(r.count / total) * 100}%` }}
                      title={`${r.label}: ${r.count}`}
                    />
                  )
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2">
                  <div className={cn("h-3 w-3 rounded-full", r.color)} />
                  <span className="text-sm text-gray-600">
                    {r.label}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-gray-900">
                    {r.count}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Bookings by weekday ─────────────────────────────────────

function BookingsByWeekdayCard({
  data,
  max,
}: {
  data: number[];
  max: number;
}) {
  const hasData = data.some((v) => v > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-gray-400" />
          Bookings by Weekday
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-4 text-center text-sm text-gray-400">
            No booking data available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {DAY_LABELS.map((day, i) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-8 text-sm font-medium text-gray-600 shrink-0">
                  {day}
                </span>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                  {data[i] > 0 && (
                    <div
                      className={cn(
                        "h-full rounded transition-all flex items-center justify-end pr-1.5",
                        i < 5 ? "bg-blue-400" : "bg-blue-300"
                      )}
                      style={{ width: `${(data[i] / max) * 100}%` }}
                    >
                      {data[i] / max > 0.15 && (
                        <span className="text-[10px] font-bold text-white">
                          {data[i]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {data[i] / max <= 0.15 && (
                  <span className="text-xs tabular-nums text-gray-500 shrink-0 w-6 text-right">
                    {data[i]}
                  </span>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">
              Total class bookings across all scheduled instances
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Subscriptions overview ──────────────────────────────────

function SubscriptionsCard({
  subsByType,
  studentsWithSub,
  totalStudents,
  totalProducts,
}: {
  subsByType: Record<string, number>;
  studentsWithSub: number;
  totalStudents: number;
  totalProducts: number;
}) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    membership: { label: "Memberships", color: "bg-blue-400" },
    promo_pass: { label: "Promo Passes", color: "bg-amber-400" },
    drop_in: { label: "Drop-ins", color: "bg-gray-400" },
    pack: { label: "Packs", color: "bg-emerald-400" },
  };
  const totalActive = Object.values(subsByType).reduce((s, v) => s + v, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-gray-400" />
          Products & Subscriptions
        </CardTitle>
        <Link
          href="/products"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalActive}</p>
            <p className="text-xs text-gray-500">Active subs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {studentsWithSub}/{totalStudents}
            </p>
            <p className="text-xs text-gray-500">Students w/ sub</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
            <p className="text-xs text-gray-500">Active products</p>
          </div>
        </div>

        {totalActive === 0 ? (
          <p className="py-2 text-center text-sm text-gray-400">
            No active subscriptions.
          </p>
        ) : (
          <div className="space-y-2.5">
            {Object.entries(typeLabels).map(([type, { label, color }]) => {
              const count = subsByType[type] ?? 0;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className={cn("h-3 w-3 rounded-full shrink-0", color)} />
                  <span className="text-sm text-gray-600 flex-1">{label}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900">
                    {count}
                  </span>
                  <div className="w-24 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", color)}
                      style={{
                        width: `${(count / totalActive) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
