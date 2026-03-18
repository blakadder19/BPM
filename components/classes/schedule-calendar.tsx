"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, AlertTriangle, Calendar, List, HelpCircle, X,
  Plus,
} from "lucide-react";
import type { MockBookableClass, MockTeacherPair } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import type { PairPreset } from "@/lib/services/pair-preset-store";
import type { ResolvedEntry } from "@/lib/domain/conflict-utils";
import { detectConflicts, buildConflictSet } from "@/lib/domain/conflict-utils";
import { SelectFilter } from "@/components/ui/select-filter";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { QuickAssignDialog } from "./quick-assign-dialog";
import { ConflictDetailDialog } from "./conflict-detail-dialog";
import { BulkAssignDialog } from "./bulk-assign-dialog";
import { resolveEntries } from "./teacher-calendar";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TYPE_OPTIONS = [
  { value: "class", label: "Class" },
  { value: "social", label: "Social" },
  { value: "student_practice", label: "Practice" },
];

// ── Date utilities ──────────────────────────────────────────

function getWeekDates(refDate: Date): string[] {
  const d = new Date(refDate);
  const jsDay = d.getUTCDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function getMonthGrid(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const jsDay = first.getUTCDay();
  const startOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const cursor = new Date(Date.UTC(year, month, 1 + startOffset));

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    const nextMonthCheck = new Date(week[0] + "T12:00:00Z");
    if (nextMonthCheck.getUTCMonth() > month && w >= 4) break;
    if (nextMonthCheck.getUTCFullYear() > year && w >= 4) break;
  }
  return weeks;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatWeekLabel(dates: string[]): string {
  if (dates.length < 7) return "";
  const s = new Date(dates[0] + "T12:00:00Z");
  const e = new Date(dates[6] + "T12:00:00Z");
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${s.getUTCDate()} – ${e.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  }
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]} ${e.getUTCFullYear()}`;
}

// ── Main Component ──────────────────────────────────────────

interface ScheduleCalendarProps {
  instances: MockBookableClass[];
  assignments: MockTeacherPair[];
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  pairPresets: PairPreset[];
  onCreateInstance?: (date: string) => void;
  onEditInstance?: (instance: MockBookableClass) => void;
  onReschedule?: (instanceId: string, newDate: string) => void;
  /** When set, the parent controls the view mode and the internal toggle is hidden. */
  forcedViewMode?: "weekly" | "monthly";
}

export function ScheduleCalendar({
  instances,
  assignments,
  teacherRoster,
  teacherNameMap,
  pairPresets,
  onCreateInstance,
  onEditInstance,
  onReschedule,
  forcedViewMode,
}: ScheduleCalendarProps) {
  const [internalViewMode, setInternalViewMode] = useState<"weekly" | "monthly">("weekly");
  const viewMode = forcedViewMode ?? internalViewMode;
  const setViewMode = setInternalViewMode;
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const [teacherFilter, setTeacherFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const [quickAssignTarget, setQuickAssignTarget] = useState<{
    entry: ResolvedEntry;
    instance: MockBookableClass;
  } | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const allEntries = useMemo(
    () => resolveEntries(instances, assignments, teacherNameMap),
    [instances, assignments, teacherNameMap]
  );

  const teacherOptions = useMemo(() => {
    const active = teacherRoster.filter((t) => t.isActive);
    return active.map((t) => ({ value: t.id, label: t.fullName }));
  }, [teacherRoster]);

  const styleOptions = useMemo(() => {
    const names = new Set(instances.map((bc) => bc.styleName).filter(Boolean) as string[]);
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
  }, [instances]);

  const locationOptions = useMemo(() => {
    const locs = new Set(instances.map((bc) => bc.location));
    return Array.from(locs).sort().map((l) => ({ value: l, label: l }));
  }, [instances]);

  const filtered = useMemo(() => {
    return allEntries.filter((e: ResolvedEntry) => {
      if (unassignedOnly && e.source !== "unassigned" && e.source !== "blocked") return false;
      if (teacherFilter && e.teacher1Id !== teacherFilter && e.teacher2Id !== teacherFilter) return false;
      if (typeFilter && e.classType !== typeFilter) return false;
      if (styleFilter && e.styleName !== styleFilter) return false;
      if (locationFilter && e.location !== locationFilter) return false;
      return true;
    });
  }, [allEntries, teacherFilter, typeFilter, styleFilter, locationFilter, unassignedOnly]);

  const visibleDates = useMemo(() => {
    if (viewMode === "weekly") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + weekOffset * 7);
      return new Set(getWeekDates(d));
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + monthOffset;
      const targetDate = new Date(Date.UTC(y, m, 1));
      const weeks = getMonthGrid(targetDate.getUTCFullYear(), targetDate.getUTCMonth());
      const dates = new Set<string>();
      for (const week of weeks) for (const d of week) dates.add(d);
      return dates;
    }
  }, [viewMode, weekOffset, monthOffset]);

  const visibleEntries = useMemo(
    () => filtered.filter((e: ResolvedEntry) => visibleDates.has(e.date)),
    [filtered, visibleDates]
  );

  const conflicts = useMemo(
    () => detectConflicts(visibleEntries, teacherNameMap),
    [visibleEntries, teacherNameMap]
  );
  const conflictInstanceIds = useMemo(() => buildConflictSet(conflicts), [conflicts]);

  const metrics = useMemo(() => {
    const total = visibleEntries.length;
    const assignedCount = visibleEntries.filter((e: ResolvedEntry) => e.source !== "unassigned" && e.source !== "blocked").length;
    const unassignedCount = visibleEntries.filter((e: ResolvedEntry) => e.source === "unassigned").length;
    const blockedCount = visibleEntries.filter((e: ResolvedEntry) => e.source === "blocked").length;
    const dateSpecificCount = visibleEntries.filter((e: ResolvedEntry) => e.source === "override" || e.source === "one-off").length;
    return { total, assigned: assignedCount, unassigned: unassignedCount, blocked: blockedCount, dateSpecific: dateSpecificCount, conflicts: conflicts.length };
  }, [visibleEntries, conflicts]);

  function handleCardClick(entry: ResolvedEntry) {
    const inst = instances.find((bc) => bc.id === entry.instanceId);
    if (inst) setQuickAssignTarget({ entry, instance: inst });
  }

  const handleDrop = useCallback((instanceId: string, newDate: string) => {
    if (onReschedule) onReschedule(instanceId, newDate);
  }, [onReschedule]);

  return (
    <div className="space-y-4">
      {/* View toggle + filters */}
      <div className="flex flex-wrap items-center gap-3">
        {!forcedViewMode && (
          <div className="flex rounded-lg border border-gray-200">
            <button
              onClick={() => setViewMode("weekly")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "weekly" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              <List className="h-3.5 w-3.5" /> Weekly
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "monthly" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Calendar className="h-3.5 w-3.5" /> Monthly
            </button>
          </div>
        )}

        <SelectFilter value={teacherFilter} onChange={setTeacherFilter} options={teacherOptions} placeholder="All Teachers" />
        <SelectFilter value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="All Types" />
        {styleOptions.length > 1 && (
          <SelectFilter value={styleFilter} onChange={setStyleFilter} options={styleOptions} placeholder="All Styles" />
        )}
        {locationOptions.length > 1 && (
          <SelectFilter value={locationFilter} onChange={setLocationFilter} options={locationOptions} placeholder="All Locations" />
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600"
          />
          Unassigned only
        </label>
      </div>

      {/* Metrics bar + bulk action */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <CalendarMetrics metrics={metrics} onConflictsClick={() => setShowConflicts(true)} />
        </div>
        <button
          onClick={() => setShowBulk(true)}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Bulk Actions
        </button>
      </div>

      {/* Grid */}
      {viewMode === "weekly" ? (
        <WeeklyGrid
          entries={visibleEntries}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          conflictIds={conflictInstanceIds}
          onCardClick={handleCardClick}
          onCreateInstance={onCreateInstance}
          onDrop={handleDrop}
        />
      ) : (
        <MonthlyGrid
          entries={visibleEntries}
          monthOffset={monthOffset}
          setMonthOffset={setMonthOffset}
          conflictIds={conflictInstanceIds}
          onCardClick={handleCardClick}
          onCreateInstance={onCreateInstance}
          onDrop={handleDrop}
        />
      )}

      {/* Legend + help */}
      <CalendarLegend />

      {/* Quick assign dialog */}
      {quickAssignTarget && (
        <QuickAssignDialog
          entry={quickAssignTarget.entry}
          instance={quickAssignTarget.instance}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          pairPresets={pairPresets}
          onClose={() => setQuickAssignTarget(null)}
        />
      )}

      {/* Conflict detail dialog */}
      {showConflicts && conflicts.length > 0 && (
        <ConflictDetailDialog
          conflicts={conflicts}
          allEntries={visibleEntries}
          instances={instances}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          pairPresets={pairPresets}
          onOpenAssign={(entry) => {
            const inst = instances.find((bc) => bc.id === entry.instanceId);
            if (inst) {
              setShowConflicts(false);
              setQuickAssignTarget({ entry, instance: inst });
            }
          }}
          onClose={() => setShowConflicts(false)}
        />
      )}

      {/* Bulk assign dialog */}
      {showBulk && (
        <BulkAssignDialog
          visibleEntries={visibleEntries}
          instances={instances}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          onClose={() => setShowBulk(false)}
        />
      )}
    </div>
  );
}

// ── Metrics ─────────────────────────────────────────────────

function CalendarMetrics({
  metrics,
  onConflictsClick,
}: {
  metrics: { total: number; assigned: number; unassigned: number; blocked: number; dateSpecific: number; conflicts: number };
  onConflictsClick?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-xs">
      <span className="text-gray-600"><strong>{metrics.total}</strong> classes</span>
      <span className="text-green-600"><strong>{metrics.assigned}</strong> assigned</span>
      <span className={metrics.unassigned > 0 ? "text-amber-600" : "text-gray-400"}>
        <strong>{metrics.unassigned}</strong> no regular teacher
      </span>
      {metrics.blocked > 0 && <span className="text-gray-500"><strong>{metrics.blocked}</strong> no teacher assigned</span>}
      {metrics.dateSpecific > 0 && <span className="text-blue-600"><strong>{metrics.dateSpecific}</strong> this-date-only</span>}
      {metrics.conflicts > 0 && (
        <button
          onClick={onConflictsClick}
          className="flex items-center gap-1 text-red-600 hover:text-red-700"
        >
          <AlertTriangle className="h-3 w-3" />
          <strong>{metrics.conflicts}</strong> conflict{metrics.conflicts !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

// ── Weekly Grid ─────────────────────────────────────────────

function WeeklyGrid({
  entries,
  weekOffset,
  setWeekOffset,
  conflictIds,
  onCardClick,
  onCreateInstance,
  onDrop,
}: {
  entries: ResolvedEntry[];
  weekOffset: number;
  setWeekOffset: (fn: (o: number) => number) => void;
  conflictIds: Set<string>;
  onCardClick: (entry: ResolvedEntry) => void;
  onCreateInstance?: (date: string) => void;
  onDrop?: (instanceId: string, newDate: string) => void;
}) {
  const baseDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const weekLabel = formatWeekLabel(weekDates);
  const today = todayStr();

  const byDate = useMemo(() => {
    const map = new Map<string, ResolvedEntry[]>();
    for (const d of weekDates) map.set(d, []);
    for (const e of entries) {
      map.get(e.date)?.push(e);
    }
    for (const [, list] of map) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [entries, weekDates]);

  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekOffset((o) => o - 1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><ChevronLeft className="h-5 w-5" /></button>
          <span className="min-w-[200px] text-center text-sm font-medium text-gray-700">{weekLabel}</span>
          <button onClick={() => setWeekOffset((o) => o + 1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><ChevronRight className="h-5 w-5" /></button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(() => 0)} className="rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">This Week</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {weekDates.map((date, i) => {
          const dayEntries = byDate.get(date) ?? [];
          const d = new Date(date + "T12:00:00Z");
          const isToday = date === today;
          const isDragTarget = dragOver === date;
          return (
            <div
              key={date}
              className={`group rounded-lg border ${isDragTarget ? "border-indigo-400 bg-indigo-50/50" : isToday ? "border-indigo-300 bg-indigo-50/30" : "border-gray-200 bg-white"} p-4 transition-colors`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(date); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const instanceId = e.dataTransfer.getData("text/plain");
                if (instanceId && onDrop) onDrop(instanceId, date);
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${isToday ? "text-indigo-700" : "text-gray-700"}`}>
                  {DAY_LABELS[i]}
                  <span className="ml-1.5 font-normal text-gray-400">{d.getUTCDate()}</span>
                  {isToday && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">Today</span>}
                </h3>
                {onCreateInstance && (
                  <button
                    onClick={() => onCreateInstance(date)}
                    className="rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100"
                    title="Add class instance"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {dayEntries.length === 0 ? (
                <p className="text-xs text-gray-400">No classes</p>
              ) : (
                <div className="space-y-2">
                  {dayEntries.map((entry) => (
                    <CalendarCard key={entry.instanceId} entry={entry} hasConflict={conflictIds.has(entry.instanceId)} compact={false} onClick={() => onCardClick(entry)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly Grid ────────────────────────────────────────────

function MonthlyGrid({
  entries,
  monthOffset,
  setMonthOffset,
  conflictIds,
  onCardClick,
  onCreateInstance,
  onDrop,
}: {
  entries: ResolvedEntry[];
  monthOffset: number;
  setMonthOffset: (fn: (o: number) => number) => void;
  conflictIds: Set<string>;
  onCardClick: (entry: ResolvedEntry) => void;
  onCreateInstance?: (date: string) => void;
  onDrop?: (instanceId: string, newDate: string) => void;
}) {
  const targetDate = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  }, [monthOffset]);

  const targetYear = targetDate.getUTCFullYear();
  const targetMonth = targetDate.getUTCMonth();

  const weeks = useMemo(() => getMonthGrid(targetYear, targetMonth), [targetYear, targetMonth]);
  const today = todayStr();

  const byDate = useMemo(() => {
    const map = new Map<string, ResolvedEntry[]>();
    for (const e of entries) {
      let list = map.get(e.date);
      if (!list) { list = []; map.set(e.date, list); }
      list.push(e);
    }
    for (const [, list] of map) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [entries]);

  const MAX_VISIBLE = 3;
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setMonthOffset((o) => o - 1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><ChevronLeft className="h-5 w-5" /></button>
        <span className="min-w-[180px] text-center text-sm font-medium text-gray-700">
          {FULL_MONTHS[targetMonth]} {targetYear}
        </span>
        <button onClick={() => setMonthOffset((o) => o + 1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><ChevronRight className="h-5 w-5" /></button>
        {monthOffset !== 0 && (
          <button onClick={() => setMonthOffset(() => 0)} className="rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">This Month</button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 gap-px border-b border-gray-200 bg-gray-100">
            {DAY_LABELS.map((d) => (
              <div key={d} className="bg-white px-2 py-1.5 text-center text-xs font-medium text-gray-500">{d}</div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px bg-gray-100">
              {week.map((date) => {
                const d = new Date(date + "T12:00:00Z");
                const isCurrentMonth = d.getUTCMonth() === targetMonth;
                const isToday = date === today;
                const dayEntries = byDate.get(date) ?? [];
                const visible = dayEntries.slice(0, MAX_VISIBLE);
                const overflow = dayEntries.length - MAX_VISIBLE;
                const isDragTarget = dragOver === date;

                return (
                  <div
                    key={date}
                    className={`group min-h-[90px] bg-white p-1.5 transition-colors ${!isCurrentMonth ? "opacity-40" : ""} ${isDragTarget ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50/30" : isToday ? "ring-2 ring-inset ring-indigo-300" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(date); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const instanceId = e.dataTransfer.getData("text/plain");
                      if (instanceId && onDrop) onDrop(instanceId, date);
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className={`text-xs font-medium ${isToday ? "text-indigo-700" : isCurrentMonth ? "text-gray-700" : "text-gray-400"}`}>
                        {d.getUTCDate()}
                      </div>
                      {onCreateInstance && isCurrentMonth && (
                        <button
                          onClick={() => onCreateInstance(date)}
                          className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100"
                          title="Add class instance"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {visible.map((entry) => (
                        <CalendarCard key={entry.instanceId} entry={entry} hasConflict={conflictIds.has(entry.instanceId)} compact onClick={() => onCardClick(entry)} />
                      ))}
                      {overflow > 0 && (
                        <p className="text-center text-[10px] text-gray-400">+{overflow} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Calendar Card ───────────────────────────────────────────

function CalendarCard({
  entry,
  hasConflict,
  compact,
  onClick,
}: {
  entry: ResolvedEntry;
  hasConflict: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const teacherText = entry.teacher1Name
    ? `${entry.teacher1Name}${entry.teacher2Name ? ` & ${entry.teacher2Name}` : ""}`
    : null;

  const dotColor =
    entry.source === "override" ? "bg-blue-500"
    : entry.source === "one-off" ? "bg-blue-500"
    : entry.source === "default" ? "bg-green-500"
    : entry.source === "blocked" ? "bg-gray-500"
    : "bg-red-400";

  const sourceLabel =
    entry.source === "override" ? "This date only"
    : entry.source === "one-off" ? "This date only"
    : entry.source === "default" ? "Regular"
    : entry.source === "blocked" ? "No teacher assigned"
    : "No regular teacher set";

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", entry.instanceId);
    e.dataTransfer.effectAllowed = "move";
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        draggable
        onDragStart={handleDragStart}
        className="w-full rounded border border-gray-100 bg-white px-1.5 py-1 text-left shadow-sm transition-colors hover:bg-gray-50 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          <span className="truncate text-[10px] font-medium text-gray-800">{entry.classTitle}</span>
          {hasConflict && <span className="shrink-0 text-[9px] font-bold text-red-500">!</span>}
        </div>
        <div className="flex items-center gap-1 text-[9px] text-gray-500">
          <span>{formatTime(entry.startTime)}</span>
          {teacherText ? (
            <span className="truncate text-gray-400">· {teacherText}</span>
          ) : (
            <span className={entry.source === "blocked" ? "text-gray-400" : "text-red-400"}>
              · {entry.source === "blocked" ? "No teacher assigned" : "No regular teacher"}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      className="w-full rounded-md border border-gray-100 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-gray-50 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight text-gray-800">{entry.classTitle}</p>
        <div className="flex shrink-0 items-center gap-1">
          {hasConflict && <Badge variant="danger" className="text-[10px]">Conflict</Badge>}
          <span className={`mt-0.5 inline-block h-2 w-2 rounded-full ${dotColor}`} title={sourceLabel} />
        </div>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
        {entry.location && <span className="ml-1.5 text-gray-400">· {entry.location}</span>}
      </p>
      <div className="mt-1">
        {teacherText ? (
          <p className="text-xs text-gray-600">
            {teacherText}
            {(entry.source === "override" || entry.source === "one-off") && <Badge variant="info" className="ml-1.5 text-[10px]">This date only</Badge>}
          </p>
        ) : entry.source === "blocked" ? (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <span className="inline-block h-3 w-3 text-center leading-3">⊘</span> No teacher assigned
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-red-500">
            <AlertTriangle className="h-3 w-3" /> No regular teacher set
          </p>
        )}
      </div>
    </button>
  );
}

// ── Legend + Help ────────────────────────────────────────────

function CalendarLegend() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Regular</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> This date only</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-gray-500" /> No teacher assigned</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> No regular teacher set</span>
        <span className="flex items-center gap-1.5"><Badge variant="danger" className="text-[10px]">Conflict</Badge></span>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="ml-auto flex items-center gap-1 text-gray-400 transition-colors hover:text-gray-600"
          title="How does scheduling work?"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="text-[10px]">Help</span>
        </button>
      </div>

      {showHelp && (
        <div className="relative rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-xs text-gray-700">
          <button
            onClick={() => setShowHelp(false)}
            className="absolute right-2 top-2 rounded p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="mb-2 text-xs font-semibold text-indigo-700">How teacher scheduling works</p>
          <div className="space-y-1.5">
            <p><span className="inline-block h-2 w-2 rounded-full bg-green-500 align-middle" /> <strong>Regular</strong> — this class uses its usual teacher assignment.</p>
            <p><span className="inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" /> <strong>This date only</strong> — this date has a different teacher assignment than usual.</p>
            <p><span className="inline-block h-2 w-2 rounded-full bg-gray-500 align-middle" /> <strong>No teacher assigned</strong> — no teacher is assigned for this specific date.</p>
            <p><span className="inline-block h-2 w-2 rounded-full bg-red-400 align-middle" /> <strong>No regular teacher set</strong> — this class does not have a usual teacher assignment configured yet.</p>
            <p><Badge variant="danger" className="text-[10px] align-middle">Conflict</Badge> — a teacher is assigned to two classes at the same time.</p>
          </div>
          <p className="mt-3 text-[10px] text-gray-500">Drag a card to another day to reschedule. Click a card to assign teachers. Use the + button to create a new class.</p>
        </div>
      )}
    </div>
  );
}
