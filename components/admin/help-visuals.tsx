import type { ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Filter,
  LayoutGrid,
  List,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ================================================================== */
/*  PRIMITIVES — reusable building blocks for help visuals            */
/* ================================================================== */

function Tag({
  children,
  color = "gray",
}: {
  children: ReactNode;
  color?: "gray" | "green" | "amber" | "red" | "blue" | "bpm";
}) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    bpm: "bg-bpm-100 text-bpm-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", colors[color])}>
      {children}
    </span>
  );
}

function Callout({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bpm-600 text-[10px] font-bold text-white">
        {n}
      </span>
      <span className="text-xs text-gray-600 leading-relaxed pt-0.5">{children}</span>
    </div>
  );
}

function VisualFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Btn({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap",
        primary
          ? "bg-bpm-600 text-white"
          : "border border-gray-200 bg-white text-gray-600",
      )}
    >
      {children}
    </span>
  );
}

function Row({
  children,
  highlighted,
  expanded,
  muted,
}: {
  children: ReactNode;
  highlighted?: boolean;
  expanded?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        highlighted
          ? "border-bpm-200 bg-bpm-50/60"
          : "border-gray-100 bg-white",
        expanded && "border-b-0 rounded-b-none",
        muted && "opacity-50",
      )}
    >
      {children}
    </div>
  );
}

function ExpandedPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-b-md border border-t-0 border-bpm-200 bg-bpm-50/30 px-3 py-3 text-xs space-y-2.5">
      {children}
    </div>
  );
}

function StatusBtn({
  label,
  color,
  active,
}: {
  label: string;
  color: "green" | "amber" | "red" | "blue";
  active?: boolean;
}) {
  const styles: Record<string, string> = {
    green: active ? "bg-green-500 text-white border-green-500" : "border-green-200 text-green-700 bg-green-50",
    amber: active ? "bg-amber-500 text-white border-amber-500" : "border-amber-200 text-amber-700 bg-amber-50",
    red: active ? "bg-red-500 text-white border-red-500" : "border-red-200 text-red-700 bg-red-50",
    blue: active ? "bg-blue-500 text-white border-blue-500" : "border-blue-200 text-blue-700 bg-blue-50",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border", styles[color])}>
      {label}
    </span>
  );
}

/* ================================================================== */
/*  BOOKINGS                                                          */
/* ================================================================== */

export function BookingsFilterBar() {
  return (
    <VisualFrame title="Filters & actions bar">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-400">
          <Search className="h-3 w-3" /> Search student or class…
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
          <Filter className="h-3 w-3" /> Status <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
          Role <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
          Type <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="ml-auto">
          <Btn primary><Plus className="h-3 w-3" /> New Booking</Btn>
        </span>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>Use filters to narrow results by status, role, or class type</Callout>
        <Callout n={2}>Search by student name or class title — press Enter to apply</Callout>
        <Callout n={3}>New Booking creates a booking on behalf of a student</Callout>
      </div>
    </VisualFrame>
  );
}

export function BookingsRowExample() {
  return (
    <VisualFrame title="Booking row — click to expand">
      <Row highlighted expanded>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-800 truncate">Maria Lopez</span>
            <span className="text-gray-400 shrink-0">→</span>
            <span className="text-gray-600 truncate">Bachata L2 — Mon 19:00</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tag color="blue">Leader</Tag>
            <Tag color="green">Confirmed</Tag>
          </div>
        </div>
      </Row>
      <ExpandedPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-gray-500">Booked: 28 Mar 2026 · Source: <Tag>Student</Tag></p>
            <p className="text-gray-500">Subscription: Bachata Monthly (5/8 classes used)</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Btn>Check In</Btn>
            <Btn>Cancel</Btn>
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <Callout n={1}>Expanded row shows booking source, linked subscription, and actions</Callout>
          <Callout n={2}>Cancel removes the reservation — use the Attendance page to mark absent</Callout>
          <Callout n={3}>Check In is a shortcut — it marks the student as present for this class</Callout>
        </div>
      </ExpandedPanel>
    </VisualFrame>
  );
}

export function BookingsStatusGuide() {
  return (
    <VisualFrame title="Booking status vs attendance status">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 rounded-md border border-gray-100 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Booking status</p>
          <p className="text-xs text-gray-500">Tracks the reservation itself</p>
          <div className="flex flex-wrap gap-1.5">
            <Tag color="green">Confirmed</Tag>
            <Tag color="green">Checked In</Tag>
            <Tag color="amber">Waitlisted</Tag>
            <Tag color="red">Cancelled</Tag>
            <Tag color="amber">Late Cancelled</Tag>
            <Tag color="red">Missed</Tag>
          </div>
        </div>
        <div className="space-y-2 rounded-md border border-gray-100 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Attendance status</p>
          <p className="text-xs text-gray-500">Tracks what happened on class day</p>
          <div className="flex flex-wrap gap-1.5">
            <Tag color="green">Present</Tag>
            <Tag color="amber">Late</Tag>
            <Tag color="red">Absent</Tag>
            <Tag color="blue">Excused</Tag>
          </div>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>A student can be Confirmed but Absent — these track different things</Callout>
        <Callout n={2}>Cancelling a booking does not record attendance — go to the Attendance page for that</Callout>
      </div>
    </VisualFrame>
  );
}

/* ================================================================== */
/*  ATTENDANCE                                                        */
/* ================================================================== */

export function AttendanceClassBlock() {
  return (
    <VisualFrame title="Today's class — students listed underneath">
      <div className="rounded-md border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-800">Bachata L2 — 19:00</span>
            <Tag color="green">Open</Tag>
          </div>
          <span className="text-[11px] text-gray-400">6 / 12 booked</span>
        </div>

        <div className="divide-y divide-gray-100">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-700">Maria Lopez</span>
              <span className="ml-2 text-[11px] text-gray-400">Leader</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <StatusBtn label="Present" color="green" active />
              <StatusBtn label="Late" color="amber" />
              <StatusBtn label="Absent" color="red" />
              <StatusBtn label="Excused" color="blue" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-700">James Chen</span>
              <span className="ml-2 text-[11px] text-gray-400">Follower</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <StatusBtn label="Present" color="green" />
              <StatusBtn label="Late" color="amber" />
              <StatusBtn label="Absent" color="red" active />
              <StatusBtn label="Excused" color="blue" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-700">Sofia Ruiz</span>
              <span className="ml-2 text-[11px] text-gray-400">Follower</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <StatusBtn label="Present" color="green" />
              <StatusBtn label="Late" color="amber" />
              <StatusBtn label="Absent" color="red" />
              <StatusBtn label="Excused" color="blue" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>Each booked student appears under their class with status buttons</Callout>
        <Callout n={2}>Tap a button to set their status — it highlights when active</Callout>
        <Callout n={3}>Unmarked students (like Sofia) still need to be processed before the class closes</Callout>
      </div>
    </VisualFrame>
  );
}

export function AttendanceStatusMeanings() {
  return (
    <VisualFrame title="What each attendance status means">
      <div className="space-y-2.5">
        <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <StatusBtn label="Present" color="green" active />
          <span className="text-xs text-gray-600 leading-relaxed">Student attended the class normally. Credit is consumed.</span>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <StatusBtn label="Late" color="amber" active />
          <span className="text-xs text-gray-600 leading-relaxed">Arrived after class started but still attended. Credit is consumed. No penalty.</span>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <StatusBtn label="Absent" color="red" active />
          <span className="text-xs text-gray-600 leading-relaxed">Did not show up at all. May trigger a no-show penalty. Credit may or may not be refunded depending on settings.</span>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <StatusBtn label="Excused" color="blue" active />
          <span className="text-xs text-gray-600 leading-relaxed">Notified in advance. No penalty applies. Credit is always refunded.</span>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ================================================================== */
/*  PRODUCTS                                                          */
/* ================================================================== */

export function ProductTypesGuide() {
  return (
    <VisualFrame title="Product types at a glance">
      <div className="space-y-2.5">
        <div className="rounded-md border border-gray-100 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Tag color="blue">Membership</Tag>
            <span className="text-xs font-medium text-gray-700">Full term access</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">Linked to one term. May be unlimited or have a class limit (e.g. 8 classes per term). Most common for regular students.</p>
        </div>
        <div className="rounded-md border border-gray-100 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Tag color="blue">Pack</Tag>
            <span className="text-xs font-medium text-gray-700">Credit-based</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">Each booking uses one credit. Not tied to any term — credits can be used across terms until they run out.</p>
        </div>
        <div className="rounded-md border border-gray-100 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Tag>Drop-in</Tag>
            <span className="text-xs font-medium text-gray-700">Single use</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">One purchase, one class. No recurring access. Good for first-timers or occasional visitors.</p>
        </div>
      </div>
    </VisualFrame>
  );
}

export function ProductRowExample() {
  return (
    <VisualFrame title="Product row — click to expand">
      <Row highlighted expanded>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-800 truncate">Bachata Monthly</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tag color="blue">Membership</Tag>
            <Tag color="green">Active</Tag>
            <span className="text-[11px] text-gray-500">€40.00</span>
          </div>
        </div>
      </Row>
      <ExpandedPanel>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <p className="text-gray-500">Class limit: <span className="font-medium text-gray-700">8 per term</span></p>
          <p className="text-gray-500">Term-bound: <Tag color="amber">Yes</Tag></p>
          <p className="text-gray-500">Styles: <span className="font-medium text-gray-700">Bachata, Bachata Trad.</span></p>
          <p className="text-gray-500">Active subs: <span className="font-medium text-gray-700">12</span></p>
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <Btn><Pencil className="h-3 w-3" /> Edit</Btn>
          <Btn>Deactivate</Btn>
        </div>
        <div className="space-y-2 pt-1">
          <Callout n={1}>Expanded row shows class limits, term binding, style restrictions, and subscription count</Callout>
          <Callout n={2}>Term-bound means students choose which term to apply it to when purchasing</Callout>
        </div>
      </ExpandedPanel>
    </VisualFrame>
  );
}

export function ProductRestrictionsExample() {
  return (
    <VisualFrame title="How style restrictions work">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <span className="text-xs font-medium text-gray-700">Bachata Monthly</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Tag color="blue">Bachata</Tag>
            <Tag color="blue">Bachata Trad.</Tag>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <span className="text-xs font-medium text-gray-700">Latin Combo Pass</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Tag color="blue">Salsa</Tag>
            <Tag color="blue">Cuban</Tag>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
          <span className="text-xs font-medium text-gray-700">All Access Pass</span>
          <Tag color="green">Unrestricted</Tag>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>Restricted products only allow booking classes of matching styles</Callout>
        <Callout n={2}>Unrestricted products work for any class in the schedule</Callout>
        <Callout n={3}>If you forget to set restrictions, the product will work for all styles by default</Callout>
      </div>
    </VisualFrame>
  );
}

/* ================================================================== */
/*  TERMS                                                             */
/* ================================================================== */

export function TermsListExample() {
  return (
    <VisualFrame title="Term list — status and week number">
      <div className="space-y-1.5">
        <Row>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-gray-800">Term 3 — Summer 2026</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-gray-400">May 4 – May 31</span>
              <Tag color="green">Active</Tag>
              <span className="text-[11px] font-medium text-gray-500">Week 2</span>
            </div>
          </div>
        </Row>
        <Row>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-gray-800">Term 4 — Summer 2026</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-gray-400">Jun 1 – Jun 28</span>
              <Tag color="blue">Upcoming</Tag>
            </div>
          </div>
        </Row>
        <Row muted>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-gray-700">Term 2 — Spring 2026</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-gray-400">Apr 6 – May 3</span>
              <Tag>Past</Tag>
            </div>
          </div>
        </Row>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>The active term is shown with a green badge and the current week number</Callout>
        <Callout n={2}>Past terms are dimmed — they are kept for records, do not delete them</Callout>
        <Callout n={3}>Always have an upcoming term visible so students can plan ahead</Callout>
      </div>
    </VisualFrame>
  );
}

export function TermsTimeline() {
  return (
    <VisualFrame title="4-week term — enrollment window">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-md border border-gray-200">
          <div className="flex">
            <div className="flex-1 bg-green-100 px-3 py-2 border-r border-green-200">
              <p className="text-[11px] font-semibold text-green-800">Week 1</p>
              <p className="text-[10px] text-green-700 mt-0.5">Open for new students</p>
            </div>
            <div className="flex-1 bg-green-50 px-3 py-2 border-r border-green-200">
              <p className="text-[11px] font-semibold text-green-700">Week 2</p>
              <p className="text-[10px] text-green-600 mt-0.5">Last week to join</p>
            </div>
            <div className="flex-1 bg-gray-50 px-3 py-2 border-r border-gray-200">
              <p className="text-[11px] font-semibold text-gray-500">Week 3</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Closed to new students</p>
            </div>
            <div className="flex-1 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-gray-500">Week 4</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Term ending soon</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Callout n={1}>Students can join the current term during weeks 1 and 2 only</Callout>
          <Callout n={2}>After week 2, new students should choose the next term instead</Callout>
          <Callout n={3}>Create the next term before week 3 so students always have a forward option</Callout>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ================================================================== */
/*  STUDENTS                                                          */
/* ================================================================== */

export function StudentsListExample() {
  return (
    <VisualFrame title="Student row — click to expand details">
      <Row highlighted expanded>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-800 truncate">Maria Lopez</span>
            <span className="text-[11px] text-gray-400">maria@example.com</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tag color="blue">Leader</Tag>
            <Tag color="green">Active</Tag>
          </div>
        </div>
      </Row>
      <ExpandedPanel>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Detail panel</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-gray-100 bg-white px-2.5 py-2 space-y-1">
            <p className="text-[11px] font-medium text-gray-700">Subscriptions</p>
            <p className="text-[11px] text-gray-500">Bachata Monthly · <Tag color="green">Active</Tag></p>
            <p className="text-[11px] text-gray-500">5/8 classes used</p>
          </div>
          <div className="rounded border border-gray-100 bg-white px-2.5 py-2 space-y-1">
            <p className="text-[11px] font-medium text-gray-700">Bookings</p>
            <p className="text-[11px] text-gray-500">3 upcoming</p>
            <p className="text-[11px] text-gray-500">12 total this term</p>
          </div>
          <div className="rounded border border-gray-100 bg-white px-2.5 py-2 space-y-1">
            <p className="text-[11px] font-medium text-gray-700">Penalties</p>
            <p className="text-[11px] text-gray-500">1 unresolved (€5.00)</p>
          </div>
          <div className="rounded border border-gray-100 bg-white px-2.5 py-2 space-y-1">
            <p className="text-[11px] font-medium text-gray-700">Wallet</p>
            <p className="text-[11px] text-gray-500">€0.00 balance</p>
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <Callout n={1}>The detail panel shows everything about a student in one place</Callout>
          <Callout n={2}>Check subscriptions first when a student reports booking issues</Callout>
        </div>
      </ExpandedPanel>
    </VisualFrame>
  );
}

export function StudentsFiltersExample() {
  return (
    <VisualFrame title="Filtering and actions">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-400">
          <Search className="h-3 w-3" /> Search by name, email…
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
          Role <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
          Status <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
          Subscription <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Btn>Term Lifecycle</Btn>
          <Btn primary><Plus className="h-3 w-3" /> Add Student</Btn>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>Filter by role, active status, or subscription status</Callout>
        <Callout n={2}>Term Lifecycle checks for expired or renewable subscriptions</Callout>
        <Callout n={3}>Use Add Student for manual registration (e.g. walk-in signups)</Callout>
      </div>
    </VisualFrame>
  );
}

/* ================================================================== */
/*  SCHEDULE                                                          */
/* ================================================================== */

export function ScheduleActionsBar() {
  return (
    <VisualFrame title="Schedule actions bar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-gray-200 bg-white overflow-hidden">
          <span className="px-2 py-1 text-[11px] font-medium text-gray-900 bg-gray-100"><List className="h-3 w-3 inline -mt-0.5" /> Table</span>
          <span className="px-2 py-1 text-[11px] text-gray-500 border-l border-gray-200"><Calendar className="h-3 w-3 inline -mt-0.5" /> Weekly</span>
          <span className="px-2 py-1 text-[11px] text-gray-500 border-l border-gray-200"><LayoutGrid className="h-3 w-3 inline -mt-0.5" /> Monthly</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Btn><Copy className="h-3 w-3" /> Copy Month</Btn>
          <Btn><ListChecks className="h-3 w-3" /> Bulk Create</Btn>
          <Btn primary><Plus className="h-3 w-3" /> Add Instance</Btn>
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>Switch between table, weekly calendar, and monthly calendar views</Callout>
        <Callout n={2}>Copy Month duplicates the previous month's schedule into a new period</Callout>
        <Callout n={3}>Bulk Create generates multiple instances from templates at once</Callout>
        <Callout n={4}>Add Instance creates a single one-off class for a specific date</Callout>
      </div>
    </VisualFrame>
  );
}

export function ScheduleRowExample() {
  return (
    <VisualFrame title="Schedule instance row">
      <div className="space-y-1.5">
        <Row highlighted expanded>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="font-medium text-gray-800 truncate">Bachata L2</span>
              <span className="text-[11px] text-gray-400">Mon 12 May · 19:00–20:00</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-gray-500">8/12</span>
              <Tag color="green">Open</Tag>
            </div>
          </div>
        </Row>
        <ExpandedPanel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <p className="text-gray-500">Style: <span className="font-medium text-gray-700">Bachata</span></p>
            <p className="text-gray-500">Location: <span className="font-medium text-gray-700">Studio A</span></p>
            <p className="text-gray-500">Teachers: <span className="font-medium text-gray-700">Ana & Carlos</span></p>
            <p className="text-gray-500">Waitlist: <span className="font-medium text-gray-700">2 waiting</span></p>
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <Btn><Pencil className="h-3 w-3" /> Edit</Btn>
            <Btn><Users className="h-3 w-3" /> Teachers</Btn>
            <Btn>Cancel Instance</Btn>
          </div>
        </ExpandedPanel>
        <Row>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="font-medium text-gray-800 truncate">Salsa L1</span>
              <span className="text-[11px] text-gray-400">Mon 12 May · 20:00–21:00</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-gray-500">5/15</span>
              <Tag color="green">Open</Tag>
            </div>
          </div>
        </Row>
        <Row muted>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="font-medium text-gray-700 truncate">Cuban Social</span>
              <span className="text-[11px] text-gray-400">Fri 9 May · 21:00–23:00</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Tag>Social</Tag>
              <Tag>Ended</Tag>
            </div>
          </div>
        </Row>
      </div>
      <div className="space-y-2 pt-1">
        <Callout n={1}>Click a row to expand and see details, bookings, and teacher info</Callout>
        <Callout n={2}>Capacity shows booked/total — the badge shows the instance status</Callout>
        <Callout n={3}>Past and non-bookable events (socials, ended classes) appear dimmed</Callout>
      </div>
    </VisualFrame>
  );
}

/* ================================================================== */
/*  VISUAL REGISTRY                                                   */
/* ================================================================== */

const VISUAL_REGISTRY: Record<string, () => ReactNode> = {
  "bookings/filter-bar": () => <BookingsFilterBar />,
  "bookings/row-example": () => <BookingsRowExample />,
  "bookings/status-guide": () => <BookingsStatusGuide />,
  "attendance/class-block": () => <AttendanceClassBlock />,
  "attendance/status-meanings": () => <AttendanceStatusMeanings />,
  "products/type-guide": () => <ProductTypesGuide />,
  "products/row-example": () => <ProductRowExample />,
  "products/restrictions": () => <ProductRestrictionsExample />,
  "terms/list-example": () => <TermsListExample />,
  "terms/timeline": () => <TermsTimeline />,
  "students/list-example": () => <StudentsListExample />,
  "students/filters": () => <StudentsFiltersExample />,
  "schedule/actions-bar": () => <ScheduleActionsBar />,
  "schedule/row-example": () => <ScheduleRowExample />,
};

export function renderHelpVisual(key: string): ReactNode {
  const factory = VISUAL_REGISTRY[key];
  return factory ? factory() : null;
}

export function hasHelpVisual(key: string): boolean {
  return key in VISUAL_REGISTRY;
}
