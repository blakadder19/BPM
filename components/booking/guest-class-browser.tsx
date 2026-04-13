"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Users,
  LogIn,
  UserPlus,
} from "lucide-react";
import { formatTime, formatShortDate, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { TermBanner } from "@/components/ui/term-banner";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import {
  RowMeta,
  MetaTime,
  MetaLocation,
  InlineBadge,
  ClassListItem,
} from "@/components/student/primitives";

// ── Types ────────────────────────────────────────────────────

export interface GuestClassData {
  id: string;
  title: string;
  classType: string;
  styleName: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  maxCapacity: number | null;
  totalBooked: number;
  danceStyleRequiresBalance: boolean;
}

interface TermInfo {
  name: string;
  startDate: string;
  endDate: string;
}

interface GuestClassBrowserProps {
  classes: GuestClassData[];
  today?: string;
  termInfo?: TermInfo | null;
}

// ── Helpers ──────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}

function getWeekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getDayNum(dateStr: string): number {
  return new Date(dateStr + "T12:00:00Z").getUTCDate();
}

// ── Component ────────────────────────────────────────────────

export function GuestClassBrowser({
  classes,
  today,
  termInfo,
}: GuestClassBrowserProps) {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr));

  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const classesByDate = useMemo(() => {
    const map = new Map<string, GuestClassData[]>();
    for (const c of classes) {
      const arr = map.get(c.date);
      if (arr) arr.push(c);
      else map.set(c.date, [c]);
    }
    return map;
  }, [classes]);

  const datesWithClasses = useMemo(() => new Set(classesByDate.keys()), [classesByDate]);

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const styleOptions = useMemo(() => {
    const names = [...new Set(classes.map((c) => c.styleName).filter(Boolean))] as string[];
    return names.sort().map((n) => ({ value: n, label: n }));
  }, [classes]);

  const levelOptions = useMemo(() => {
    const levels = [...new Set(classes.map((c) => c.level).filter(Boolean))] as string[];
    return levels.sort().map((l) => ({ value: l, label: l }));
  }, [classes]);

  const dayClasses = useMemo(() => {
    let result = classesByDate.get(selectedDate) ?? [];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.styleName?.toLowerCase().includes(q) ||
          c.level?.toLowerCase().includes(q)
      );
    }
    if (styleFilter) result = result.filter((c) => c.styleName === styleFilter);
    if (levelFilter) result = result.filter((c) => c.level === levelFilter);
    return result;
  }, [classesByDate, selectedDate, search, styleFilter, levelFilter]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const [date, items] of classesByDate) {
      map.set(date, items.length);
    }
    return map;
  }, [classesByDate]);

  function prevWeek() { setWeekStart(addDays(weekStart, -7)); }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)); }
  function goToday() {
    setSelectedDate(todayStr);
    setWeekStart(getMonday(todayStr));
  }

  function isInTerm(d: string): boolean {
    if (!termInfo) return false;
    return d >= termInfo.startDate && d <= termInfo.endDate;
  }

  const monthLabel = getMonthLabel(weekDates[3]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Explore Classes"
        description="Browse the schedule — log in or sign up to book."
      />

      {termInfo && (
        <TermBanner
          name={termInfo.name}
          startDate={termInfo.startDate}
          endDate={termInfo.endDate}
        />
      )}

      {/* Auth CTA banner */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-bpm-200 bg-bpm-50/50 px-3 py-2.5">
        <p className="flex-1 text-xs font-medium text-bpm-800 min-w-0">
          Ready to book? Log in or create an account.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md bg-bpm-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-bpm-700"
          >
            <LogIn className="h-3.5 w-3.5" />
            Log in
          </a>
          <a
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-md border border-bpm-200 bg-white px-3 py-1.5 text-xs font-semibold text-bpm-700 transition-colors hover:bg-bpm-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Sign up
          </a>
        </div>
      </div>

      {/* Week calendar strip */}
      <div className="rounded-md border border-gray-200 bg-white p-2.5 sm:p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-800">{monthLabel}</h2>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={goToday}
              className="rounded-md px-2 sm:px-2.5 py-1 text-xs font-medium text-bpm-600 hover:bg-bpm-50 transition-colors"
            >
              Today
            </button>
            <button
              onClick={prevWeek}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextWeek}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {weekDates.map((d, i) => {
            const isToday = d === todayStr;
            const isSelected = d === selectedDate;
            const hasClasses = datesWithClasses.has(d);
            const isPast = d < todayStr;

            return (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`
                  relative flex flex-col items-center rounded-md py-1.5 px-0.5 sm:px-1 transition-all text-center min-h-[52px]
                  ${isSelected
                    ? "bg-bpm-600 text-white shadow-sm"
                    : isToday
                      ? "bg-bpm-50 text-bpm-700 ring-1 ring-bpm-200"
                      : isPast
                        ? "text-gray-400 hover:bg-gray-50"
                        : "text-gray-700 hover:bg-gray-50"
                  }
                `}
              >
                <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wide">
                  {DAY_LABELS[i]}
                </span>
                <span className={`mt-0.5 text-sm sm:text-base font-semibold leading-tight ${
                  isSelected ? "text-white" : ""
                }`}>
                  {getDayNum(d)}
                </span>

                <div className="mt-0.5 flex items-center gap-0.5 h-1.5">
                  {hasClasses && (
                    <span className={`h-1 w-1 rounded-full ${
                      isSelected ? "bg-white/60" : "bg-gray-300"
                    }`} />
                  )}
                </div>

                {isInTerm(d) && !isSelected && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-3 rounded-full bg-bpm-300" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px] text-gray-400 px-1">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> Has classes
          </span>
          {termInfo && (
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded-full bg-bpm-300" /> In term
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search classes…"
          />
        </div>
        <div className="flex gap-1.5 w-full sm:w-auto">
          <SelectFilter
            value={styleFilter}
            onChange={setStyleFilter}
            options={styleOptions}
            placeholder="All styles"
          />
          <SelectFilter
            value={levelFilter}
            onChange={setLevelFilter}
            options={levelOptions}
            placeholder="All levels"
          />
        </div>
      </div>

      {/* Day header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {selectedDate === todayStr ? "Today" : formatDate(selectedDate)}
          {selectedDate === todayStr && (
            <span className="ml-1.5 text-xs font-normal text-gray-500">
              {formatShortDate(selectedDate)}
            </span>
          )}
        </h2>
        <span className="text-xs text-gray-500">
          {dayClasses.length} class{dayClasses.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Class list */}
      {dayClasses.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 py-8 text-center">
          <Inbox className="mx-auto h-6 w-6 text-gray-300 mb-1.5" />
          <p className="text-sm text-gray-500">
            {datesWithClasses.has(selectedDate)
              ? "No classes match your filters for this day."
              : "No classes scheduled for this day."
            }
          </p>
          {!datesWithClasses.has(selectedDate) && selectedDate >= todayStr && (
            <p className="mt-1 text-xs text-gray-400">
              Try selecting a different date on the calendar.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {dayClasses.map((c) => {
            const spotsLeft = c.maxCapacity != null ? c.maxCapacity - c.totalBooked : null;
            return (
              <ClassListItem
                key={c.id}
                name={c.title}
                badges={
                  <>
                    {c.styleName && <InlineBadge>{c.styleName}</InlineBadge>}
                    {c.level && <InlineBadge className="bg-gray-100 text-gray-600">{c.level}</InlineBadge>}
                    {c.danceStyleRequiresBalance && <InlineBadge className="bg-violet-50 text-violet-600">Role</InlineBadge>}
                  </>
                }
                meta={
                  <RowMeta>
                    <MetaTime>{formatTime(c.startTime)} – {formatTime(c.endTime)}</MetaTime>
                    <MetaLocation>{c.location}</MetaLocation>
                    {spotsLeft !== null && (
                      <span className={`inline-flex items-center gap-1 ${
                        spotsLeft <= 3 && spotsLeft > 0
                          ? "text-amber-600 font-medium"
                          : spotsLeft === 0
                            ? "text-red-500 font-medium"
                            : ""
                      }`}>
                        <Users className="h-3 w-3" />
                        {spotsLeft === 0 ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}`}
                      </span>
                    )}
                  </RowMeta>
                }
                action={
                  <a
                    href="/login"
                    className="shrink-0 rounded-md bg-bpm-100 px-2 py-1 text-[10px] font-semibold text-bpm-700 transition-colors hover:bg-bpm-200"
                  >
                    Log in to book
                  </a>
                }
              />
            );
          })}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-5 text-center">
        <p className="text-sm font-medium text-gray-700">
          Want to join a class?
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md bg-bpm-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-bpm-700"
          >
            <LogIn className="h-3.5 w-3.5" />
            Log in
          </a>
          <a
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create account
          </a>
        </div>
      </div>
    </div>
  );
}
