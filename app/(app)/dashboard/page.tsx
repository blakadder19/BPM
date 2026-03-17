"use client";

import { useMemo } from "react";
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
import { formatDate, formatCents, cn } from "@/lib/utils";
import {
  BOOKABLE_CLASSES,
  BOOKINGS,
  WAITLIST_ENTRIES,
  ATTENDANCE,
  PENALTIES,
  SUBSCRIPTIONS,
  STUDENTS,
  PRODUCTS,
} from "@/lib/mock-data";

const MOCK_TODAY = "2026-03-17";
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Data computation ────────────────────────────────────────

function computeDashboard() {
  const todaysClasses = BOOKABLE_CLASSES.filter(
    (bc) => bc.date === MOCK_TODAY && bc.classType === "class"
  );

  const upcomingClasses = BOOKABLE_CLASSES.filter(
    (bc) => bc.date >= MOCK_TODAY && bc.classType === "class"
  ).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const upcomingBookings = BOOKINGS.filter(
    (b) => b.date >= MOCK_TODAY && b.status === "confirmed"
  );

  const activeWaitlists = WAITLIST_ENTRIES.filter(
    (w) => w.status === "waiting"
  );

  const unresolvedPenalties = PENALTIES.filter(
    (p) => p.resolution === "monetary_pending"
  );

  // Highest demand: top 5 upcoming classes by fill rate
  const demandClasses = BOOKABLE_CLASSES.filter(
    (bc) => bc.classType === "class" && bc.maxCapacity && bc.maxCapacity > 0
  )
    .map((bc) => ({
      ...bc,
      fillRate: bc.bookedCount / bc.maxCapacity!,
    }))
    .sort((a, b) => b.fillRate - a.fillRate)
    .slice(0, 5);

  // Leader/follower balance for upcoming partner classes
  const partnerClasses = upcomingClasses.filter(
    (bc) => bc.leaderCap !== null && bc.followerCap !== null && bc.bookedCount > 0
  );

  // Attendance summary from all historical records
  const attendanceTotals = {
    present: ATTENDANCE.filter((a) => a.status === "present").length,
    late: ATTENDANCE.filter((a) => a.status === "late").length,
    absent: ATTENDANCE.filter((a) => a.status === "absent").length,
    excused: ATTENDANCE.filter((a) => a.status === "excused").length,
  };
  const attendanceTotal =
    attendanceTotals.present +
    attendanceTotals.late +
    attendanceTotals.absent +
    attendanceTotals.excused;

  // Bookings by weekday — aggregate bookedCount from BOOKABLE_CLASSES (class type only)
  const byWeekday = [0, 0, 0, 0, 0, 0, 0]; // Mon–Sun
  for (const bc of BOOKABLE_CLASSES) {
    if (bc.classType !== "class") continue;
    const dow = new Date(bc.date + "T12:00:00Z").getUTCDay(); // 0=Sun
    const idx = dow === 0 ? 6 : dow - 1; // shift to Mon=0
    byWeekday[idx] += bc.bookedCount;
  }
  const maxWeekday = Math.max(...byWeekday, 1);

  // Subscriptions overview
  const activeSubs = SUBSCRIPTIONS.filter((s) => s.status === "active");
  const subsByType = new Map<string, number>();
  for (const s of activeSubs) {
    subsByType.set(s.productType, (subsByType.get(s.productType) ?? 0) + 1);
  }
  const studentsWithSub = new Set(activeSubs.map((s) => s.studentId)).size;

  return {
    todaysClassCount: todaysClasses.length,
    upcomingBookingCount: upcomingBookings.length,
    activeWaitlistCount: activeWaitlists.length,
    unresolvedPenaltyCount: unresolvedPenalties.length,
    unresolvedPenaltyTotal: unresolvedPenalties.reduce((s, p) => s + p.amountCents, 0),
    upcomingClasses: upcomingClasses.slice(0, 8),
    demandClasses,
    partnerClasses,
    attendanceTotals,
    attendanceTotal,
    byWeekday,
    maxWeekday,
    subsByType,
    studentsWithSub,
    totalStudents: STUDENTS.length,
    totalProducts: PRODUCTS.filter((p) => p.isActive).length,
  };
}

// ── Page ────────────────────────────────────────────────────

export default function DashboardPage() {
  const d = useMemo(() => computeDashboard(), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Overview as of ${formatDate(MOCK_TODAY)}`}
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

function UpcomingClassesCard({
  classes,
}: {
  classes: typeof BOOKABLE_CLASSES;
}) {
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

function HighestDemandCard({
  classes,
}: {
  classes: Array<typeof BOOKABLE_CLASSES[number] & { fillRate: number }>;
}) {
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

function RoleBalanceCard({
  classes,
}: {
  classes: typeof BOOKABLE_CLASSES;
}) {
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
  subsByType: Map<string, number>;
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
  const totalActive = Array.from(subsByType.values()).reduce((s, v) => s + v, 0);

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
              const count = subsByType.get(type) ?? 0;
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

// ── Helpers ─────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
