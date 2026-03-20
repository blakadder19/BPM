"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { EmptyState } from "@/components/ui/empty-state";
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

interface ClassBrowserProps {
  classes: ClassCardData[];
  codeOfConductAccepted?: boolean;
  studentPreferredRole?: string | null;
}

export function ClassBrowser({ classes, codeOfConductAccepted = true, studentPreferredRole }: ClassBrowserProps) {
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

  const styleOptions = useMemo(() => {
    const names = [...new Set(classes.map((c) => c.styleName).filter(Boolean))] as string[];
    return names.sort().map((n) => ({ value: n, label: n }));
  }, [classes]);

  const levelOptions = useMemo(() => {
    const levels = [...new Set(classes.map((c) => c.level).filter(Boolean))] as string[];
    return levels.sort().map((l) => ({ value: l, label: l }));
  }, [classes]);

  const filtered = useMemo(() => {
    let result = classes;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.styleName?.toLowerCase().includes(q) ||
          c.level?.toLowerCase().includes(q)
      );
    }
    if (styleFilter) {
      result = result.filter((c) => c.styleName === styleFilter);
    }
    if (levelFilter) {
      result = result.filter((c) => c.level === levelFilter);
    }
    return result;
  }, [classes, search, styleFilter, levelFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClassCardData[]>();
    for (const c of filtered) {
      const existing = map.get(c.date);
      if (existing) {
        existing.push(c);
      } else {
        map.set(c.date, [c]);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Available Classes"
        description="Browse and book upcoming classes."
      />

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

      {grouped.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No classes found"
          description="Try adjusting your filters or check back later."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                {formatDate(date)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                  <StudentClassCard
                    key={c.id}
                    data={c}
                    onBook={handleBook}
                    onRestore={handleRestore}
                    onAcceptCoc={!cocAccepted ? () => setShowCocDialog(true) : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

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
