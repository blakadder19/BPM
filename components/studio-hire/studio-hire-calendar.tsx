"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatShortDate } from "@/lib/utils";
import { isOvernightBooking } from "@/lib/domain/studio-hire-conflicts";
import type { StoredStudioHire } from "@/lib/services/studio-hire-service";
import type { StudioHireStatus } from "@/types/domain";

const HOUR_START = 8;
const HOUR_END = 25; // 25 = 01:00 next day — covers overnight tail
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const TOTAL_SLOTS = HOUR_END - HOUR_START;
const SLOT_HEIGHT = 36; // compact: was 56

const DAY_LABELS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLES: Record<StudioHireStatus, { bg: string; border: string; text: string; dot: string }> = {
  enquiry:   { bg: "bg-blue-50 hover:bg-blue-100",     border: "border-blue-200",   text: "text-blue-800",   dot: "bg-blue-400" },
  pending:   { bg: "bg-amber-50 hover:bg-amber-100",   border: "border-amber-200",  text: "text-amber-800",  dot: "bg-amber-400" },
  confirmed: { bg: "bg-emerald-50 hover:bg-emerald-100", border: "border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500" },
  cancelled: { bg: "bg-gray-50 hover:bg-gray-100",     border: "border-gray-300",   text: "text-gray-400",   dot: "bg-gray-400" },
};

const STATUS_LABELS: Record<StudioHireStatus, string> = {
  enquiry: "Enquiry",
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const BADGE_VARIANT: Record<StudioHireStatus, "info" | "warning" | "success" | "neutral"> = {
  enquiry: "info",
  pending: "warning",
  confirmed: "success",
  cancelled: "neutral",
};

function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextDayStr(date: string): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

function hourLabel(h: number): string {
  if (h < 24) return h.toString().padStart(2, "0") + ":00";
  return (h - 24).toString().padStart(2, "0") + ":00";
}

interface CalendarSegment {
  entry: StoredStudioHire;
  date: string;
  startHour: number;
  endHour: number;
  isOvernight: boolean;
  /** "start" = first half of overnight on the start day; "end" = tail on next day */
  overnightPart?: "start" | "end";
}

interface Props {
  entries: StoredStudioHire[];
  onEntryClick?: (entry: StoredStudioHire) => void;
}

export function StudioHireCalendar({ entries, onEntryClick }: Props) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekDateStrs = useMemo(() => weekDates.map(toDateStr), [weekDates]);

  const segmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarSegment[]>();
    const weekSet = new Set(weekDateStrs);

    for (const e of entries) {
      const overnight = isOvernightBooking(e.startTime, e.endTime);

      if (!overnight) {
        if (weekSet.has(e.date)) {
          const arr = map.get(e.date) ?? [];
          arr.push({
            entry: e,
            date: e.date,
            startHour: parseTime(e.startTime),
            endHour: parseTime(e.endTime),
            isOvernight: false,
          });
          map.set(e.date, arr);
        }
      } else {
        // Segment 1: start day, startTime → HOUR_END
        if (weekSet.has(e.date)) {
          const arr = map.get(e.date) ?? [];
          arr.push({
            entry: e,
            date: e.date,
            startHour: parseTime(e.startTime),
            endHour: HOUR_END,
            isOvernight: true,
            overnightPart: "start",
          });
          map.set(e.date, arr);
        }
        // Segment 2: next day, 0:00 → endTime (rendered as 24+h to keep on the start-day column would be confusing; instead show on next day's column at the top)
        const nd = nextDayStr(e.date);
        if (weekSet.has(nd)) {
          const endH = parseTime(e.endTime);
          if (endH > 0) {
            const arr = map.get(nd) ?? [];
            arr.push({
              entry: e,
              date: nd,
              startHour: HOUR_START,
              endHour: Math.max(endH, HOUR_START + 0.5),
              isOvernight: true,
              overnightPart: "end",
            });
            map.set(nd, arr);
          }
        }
      }
    }
    return map;
  }, [entries, weekDateStrs]);

  const todayStr = toDateStr(new Date());
  const gridHeight = TOTAL_SLOTS * SLOT_HEIGHT;

  return (
    <div className="space-y-3">
      {/* Navigation bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(getMonday(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-gray-700">
            {formatShortDate(toDateStr(weekDates[0]))} –{" "}
            {formatShortDate(toDateStr(weekDates[6]))}
          </span>
        </div>

        {/* Legend */}
        <div className="hidden md:flex items-center gap-3">
          {(["enquiry", "pending", "confirmed", "cancelled"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_STYLES[s].dot)} />
              {STATUS_LABELS[s]}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-auto" style={{ maxHeight: "70vh" }}>
        {/* Column headers */}
        <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div className="border-r border-gray-200" />
          {weekDates.map((d, i) => {
            const ds = toDateStr(d);
            const isToday = ds === todayStr;
            return (
              <div
                key={ds}
                className={cn(
                  "px-1 py-1.5 text-center text-xs font-medium border-r border-gray-200 last:border-r-0",
                  isToday ? "bg-indigo-50 text-indigo-700" : "text-gray-600"
                )}
              >
                <div className="leading-tight">{DAY_LABELS_SHORT[i]}</div>
                <div className={cn("text-sm leading-tight", isToday && "font-bold")}>
                  {d.getUTCDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Body: time gutter + 7 day columns */}
        <div className="grid grid-cols-[48px_repeat(7,1fr)]">
          {/* Time gutter */}
          <div className="border-r border-gray-200" style={{ height: gridHeight }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative border-b border-gray-100"
                style={{ height: SLOT_HEIGHT }}
              >
                <span className="absolute -top-2 right-1 text-[10px] text-gray-400 select-none leading-none">
                  {hourLabel(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((d) => {
            const ds = toDateStr(d);
            const isToday = ds === todayStr;
            const daySegments = segmentsByDate.get(ds) ?? [];

            return (
              <div
                key={ds}
                className={cn(
                  "relative border-r border-gray-200 last:border-r-0",
                  isToday && "bg-indigo-50/20"
                )}
                style={{ height: gridHeight }}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-b border-gray-100"
                    style={{ top: (hour - HOUR_START) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                  />
                ))}

                {/* Entry blocks */}
                {daySegments.map((seg) => {
                  const clampedStart = Math.max(seg.startHour, HOUR_START);
                  const clampedEnd = Math.min(seg.endHour, HOUR_END);
                  if (clampedEnd <= clampedStart) return null;

                  const topPx = (clampedStart - HOUR_START) * SLOT_HEIGHT;
                  const heightPx = (clampedEnd - clampedStart) * SLOT_HEIGHT;
                  const colors = STATUS_STYLES[seg.entry.status];
                  const isTall = heightPx >= SLOT_HEIGHT;
                  const segKey = `${seg.entry.id}-${seg.overnightPart ?? "full"}`;

                  return (
                    <button
                      key={segKey}
                      onClick={() => onEntryClick?.(seg.entry)}
                      className={cn(
                        "absolute inset-x-0.5 rounded border shadow-sm transition-shadow hover:shadow-md z-[1] cursor-pointer text-left overflow-hidden px-1 py-0.5",
                        colors.bg,
                        colors.border,
                        colors.text,
                        seg.entry.status === "cancelled" && "opacity-60 line-through",
                        seg.overnightPart === "start" && "rounded-b-none border-b-0",
                        seg.overnightPart === "end" && "rounded-t-none border-t-0 border-dashed"
                      )}
                      style={{ top: topPx + 1, height: Math.max(heightPx - 2, 16) }}
                      title={`${seg.entry.requesterName}\n${seg.entry.startTime}–${seg.entry.endTime}${seg.isOvernight ? " (overnight)" : ""}\n${STATUS_LABELS[seg.entry.status]}`}
                    >
                      <p className="truncate text-[10px] font-semibold leading-tight no-underline">
                        {seg.overnightPart === "end" && <Moon className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}
                        {seg.entry.requesterName}
                      </p>
                      {isTall && (
                        <p className="truncate text-[9px] opacity-75 no-underline leading-tight">
                          {seg.entry.startTime}–{seg.entry.endTime}
                        </p>
                      )}
                      {heightPx >= SLOT_HEIGHT * 2 && (
                        <Badge
                          variant={BADGE_VARIANT[seg.entry.status]}
                          className="mt-0.5 text-[8px] px-1 py-0 no-underline"
                        >
                          {STATUS_LABELS[seg.entry.status]}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
