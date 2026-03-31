"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { formatDate, formatTime, formatShortDate } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { StudentClassCard, type ClassCardData } from "./student-class-card";
import {
  StudentBookDialog,
  type BookDialogClass,
} from "./student-book-dialog";
import type { DanceRole } from "@/types/domain";
import {
  studentRestoreBookingAction,
  checkRestoreEligibilityAction,
} from "@/lib/actions/booking-student";
import { CocAcceptanceDialog } from "./coc-acceptance-dialog";

// ── Helpers ─────────────────────────────────────────────────

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

// ── Props ───────────────────────────────────────────────────

interface TermInfo {
  name: string;
  startDate: string;
  endDate: string;
}

interface ClassBrowserProps {
  classes: ClassCardData[];
  codeOfConductAccepted?: boolean;
  studentPreferredRole?: string | null;
  today?: string;
  termInfo?: TermInfo | null;
}

// ── Component ───────────────────────────────────────────────

export function ClassBrowser({
  classes,
  codeOfConductAccepted = true,
  studentPreferredRole,
  today,
  termInfo,
}: ClassBrowserProps) {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr));

  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const [bookDialogTarget, setBookDialogTarget] = useState<ClassCardData | null>(null);
  const [restoreBookingId, setRestoreBookingId] = useState<string | null>(null);
  const [showCocDialog, setShowCocDialog] = useState(false);
  const [cocAccepted, setCocAccepted] = useState(codeOfConductAccepted);
  const [pendingBookTarget, setPendingBookTarget] = useState<ClassCardData | null>(null);

  const restoreClassData = useMemo(() => {
    if (!restoreBookingId) return null;
    return classes.find(
      (c) =>
        c.bookability.status === "restore_available" &&
        c.bookability.bookingId === restoreBookingId
    ) ?? null;
  }, [restoreBookingId, classes]);

  // Index: date → classes for O(1) lookup
  const classesByDate = useMemo(() => {
    const map = new Map<string, ClassCardData[]>();
    for (const c of classes) {
      const arr = map.get(c.date);
      if (arr) arr.push(c);
      else map.set(c.date, [c]);
    }
    return map;
  }, [classes]);

  // All dates that have at least one class
  const datesWithClasses = useMemo(() => new Set(classesByDate.keys()), [classesByDate]);

  // Week dates
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  // Filter options
  const styleOptions = useMemo(() => {
    const names = [...new Set(classes.map((c) => c.styleName).filter(Boolean))] as string[];
    return names.sort().map((n) => ({ value: n, label: n }));
  }, [classes]);

  const levelOptions = useMemo(() => {
    const levels = [...new Set(classes.map((c) => c.level).filter(Boolean))] as string[];
    return levels.sort().map((l) => ({ value: l, label: l }));
  }, [classes]);

  // Classes for the selected date, with filters applied
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

  // Counts per date (unfiltered) for calendar dots
  const countByDate = useMemo(() => {
    const map = new Map<string, { total: number; booked: number }>();
    for (const [date, items] of classesByDate) {
      const booked = items.filter(
        (c) => c.bookability.status === "already_booked" || c.bookability.status === "already_waitlisted"
      ).length;
      map.set(date, { total: items.length, booked });
    }
    return map;
  }, [classesByDate]);

  // Navigation
  function prevWeek() {
    const newStart = addDays(weekStart, -7);
    setWeekStart(newStart);
  }
  function nextWeek() {
    const newStart = addDays(weekStart, 7);
    setWeekStart(newStart);
  }
  function goToday() {
    setSelectedDate(todayStr);
    setWeekStart(getMonday(todayStr));
  }

  function selectDate(d: string) {
    setSelectedDate(d);
  }

  // Booking handlers
  function handleBook(data: ClassCardData) {
    if (!cocAccepted) {
      setPendingBookTarget(data);
      setShowCocDialog(true);
      return;
    }
    setBookDialogTarget(data);
  }

  function handleCocAccepted() {
    setCocAccepted(true);
    setShowCocDialog(false);
    if (pendingBookTarget) {
      setBookDialogTarget(pendingBookTarget);
      setPendingBookTarget(null);
    }
  }

  function handleRestore(bookingId: string) {
    setRestoreBookingId(bookingId);
  }

  const dialogClass: BookDialogClass | null = bookDialogTarget
    ? {
        id: bookDialogTarget.id,
        title: bookDialogTarget.title,
        date: bookDialogTarget.date,
        startTime: bookDialogTarget.startTime,
        endTime: bookDialogTarget.endTime,
        location: bookDialogTarget.location,
        styleName: bookDialogTarget.styleName,
        level: bookDialogTarget.level,
        danceStyleRequiresBalance: bookDialogTarget.danceStyleRequiresBalance,
        spotsLeft:
          bookDialogTarget.maxCapacity != null
            ? bookDialogTarget.maxCapacity - bookDialogTarget.totalBooked
            : null,
      }
    : null;

  const bookabilityForDialog = bookDialogTarget?.bookability;

  // Whether a given date is inside the current term
  function isInTerm(d: string): boolean {
    if (!termInfo) return false;
    return d >= termInfo.startDate && d <= termInfo.endDate;
  }

  const monthLabel = getMonthLabel(weekDates[3]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description="Browse and book your classes."
      />

      {/* Term banner */}
      {termInfo && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm">
          <CalendarDays className="h-4 w-4 text-indigo-500 shrink-0" />
          <span className="font-medium text-indigo-800">{termInfo.name}</span>
          <span className="text-indigo-600">
            {formatShortDate(termInfo.startDate)} – {formatShortDate(termInfo.endDate)}
          </span>
        </div>
      )}

      {/* Week calendar strip */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {/* Header: month + navigation */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={goToday}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
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

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((d, i) => {
            const isToday = d === todayStr;
            const isSelected = d === selectedDate;
            const hasClasses = datesWithClasses.has(d);
            const stats = countByDate.get(d);
            const inTerm = isInTerm(d);
            const isPast = d < todayStr;

            return (
              <button
                key={d}
                onClick={() => selectDate(d)}
                className={`
                  relative flex flex-col items-center rounded-lg py-2 px-1 transition-all text-center
                  ${isSelected
                    ? "bg-indigo-600 text-white shadow-md"
                    : isToday
                      ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                      : isPast
                        ? "text-gray-400 hover:bg-gray-50"
                        : "text-gray-700 hover:bg-gray-50"
                  }
                `}
              >
                <span className="text-[11px] font-medium uppercase tracking-wide">
                  {DAY_LABELS[i]}
                </span>
                <span className={`mt-0.5 text-lg font-semibold leading-tight ${
                  isSelected ? "text-white" : ""
                }`}>
                  {getDayNum(d)}
                </span>

                {/* Class dot indicators */}
                <div className="mt-1 flex items-center gap-0.5 h-2">
                  {hasClasses && stats && (
                    <>
                      {stats.booked > 0 && (
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white/80" : "bg-blue-500"
                        }`} />
                      )}
                      {stats.total - stats.booked > 0 && (
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white/50" : "bg-gray-300"
                        }`} />
                      )}
                    </>
                  )}
                </div>

                {/* Term indicator line */}
                {inTerm && !isSelected && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-indigo-300" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-400 px-1">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> You have bookings
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> Available classes
          </span>
          {termInfo && (
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded-full bg-indigo-300" /> In term
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, style, or level…"
          />
        </div>
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

      {/* Day header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {selectedDate === todayStr
            ? "Today"
            : formatDate(selectedDate)
          }
          {selectedDate === todayStr && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              {formatShortDate(selectedDate)}
            </span>
          )}
        </h2>
        <span className="text-sm text-gray-500">
          {dayClasses.length} class{dayClasses.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Class cards for selected day */}
      {dayClasses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-gray-300 mb-2" />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dayClasses.map((c) => (
            <StudentClassCard
              key={c.id}
              data={c}
              onBook={handleBook}
              onRestore={handleRestore}
              onAcceptCoc={!cocAccepted ? () => setShowCocDialog(true) : undefined}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {bookDialogTarget && dialogClass && bookabilityForDialog && (
        (bookabilityForDialog.status === "bookable" || bookabilityForDialog.status === "waitlistable") && (
          <StudentBookDialog
            cls={dialogClass}
            entitlements={bookabilityForDialog.entitlements}
            autoSelected={
              bookabilityForDialog.status === "bookable"
                ? bookabilityForDialog.autoSelected
                : undefined
            }
            isWaitlist={bookabilityForDialog.status === "waitlistable"}
            waitlistReason={
              bookabilityForDialog.status === "waitlistable"
                ? bookabilityForDialog.reason
                : undefined
            }
            defaultDanceRole={studentPreferredRole as DanceRole | null | undefined}
            onClose={() => setBookDialogTarget(null)}
          />
        )
      )}

      {restoreBookingId && restoreClassData && (
        <ClassRestoreDialog
          bookingId={restoreBookingId}
          classData={restoreClassData}
          onClose={() => setRestoreBookingId(null)}
        />
      )}

      {showCocDialog && (
        <CocAcceptanceDialog
          onClose={() => {
            setShowCocDialog(false);
            setPendingBookTarget(null);
          }}
          onAccepted={handleCocAccepted}
        />
      )}
    </div>
  );
}

// ── Restore Dialog (unchanged) ──────────────────────────────

function ClassRestoreDialog({
  bookingId,
  classData,
  onClose,
}: {
  bookingId: string;
  classData: ClassCardData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<{
    eligible: boolean;
    reason?: string;
  } | null>(null);
  const [result, setResult] = useState<{
    restoredTo: "confirmed" | "waitlisted";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkRestoreEligibilityAction(bookingId).then((res) => {
      if (!cancelled) setEligibility(res);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function handleRestore() {
    startTransition(async () => {
      const res = await studentRestoreBookingAction(bookingId);
      if (res.success) {
        setResult({ restoredTo: res.restoredTo! });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to restore booking");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore Booking</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1 text-sm text-gray-600">
            <p className="font-medium text-gray-900">{classData.title}</p>
            <p>
              {formatDate(classData.date)} · {formatTime(classData.startTime)}
            </p>
            {classData.location && <p>{classData.location}</p>}
            <div className="mt-1">
              <StatusBadge status="cancelled" />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {result ? (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {result.restoredTo === "confirmed"
                ? "Booking restored! Your spot is confirmed."
                : "The class is full. You have been added to the waitlist."}
            </div>
          ) : eligibility === null ? (
            <p className="text-sm text-gray-400">Checking eligibility…</p>
          ) : !eligibility.eligible ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {eligibility.reason ?? "This booking cannot be restored."}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Would you like to restore this booking? If a spot is available,
              your booking will be confirmed. Otherwise, you will be added to
              the waitlist.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {result || (eligibility && !eligibility.eligible) ? (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleRestore}
                disabled={isPending || !eligibility?.eligible}
              >
                {isPending ? "Restoring…" : "Restore Booking"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
