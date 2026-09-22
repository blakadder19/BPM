/**
 * Booking service — orchestrates domain logic with a data store.
 *
 * Uses an in-memory store for MVP; swap internals to Supabase queries
 * when connected. The class is instantiable for easy testing.
 */

import {
  canBook,
  isBookableClassType,
  nextWaitlistPosition,
  type BookableClassCapacity,
} from "@/lib/domain/booking-rules";
import {
  findPromotionCandidate,
  findIneligibleCandidates,
  reindexPositions,
} from "@/lib/domain/waitlist-rules";
import { generateId } from "@/lib/utils";
import { generateCheckInToken } from "@/lib/domain/checkin-token";
import type {
  ClassType,
  DanceRole,
  InstanceStatus,
  BookingStatus,
  BookingSource,
  WaitlistStatus,
} from "@/types/domain";

// ── Store types ─────────────────────────────────────────────

export interface StoredBooking {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  danceRole: DanceRole | null;
  status: BookingStatus;
  source: BookingSource;
  subscriptionId: string | null;
  subscriptionName: string | null;
  adminNote: string | null;
  bookedAt: string;
  cancelledAt: string | null;
  checkInToken: string | null;
}

export interface StoredWaitlistEntry {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  danceRole: DanceRole | null;
  status: WaitlistStatus;
  position: number;
  joinedAt: string;
  promotedAt: string | null;
  subscriptionId: string | null;
  subscriptionName: string | null;
}

export interface ClassSnapshot {
  id: string;
  title: string;
  classType: ClassType;
  styleName: string | null;
  danceStyleRequiresBalance: boolean;
  status: InstanceStatus;
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
}

// ── Outcome types ───────────────────────────────────────────

export type BookingOutcome =
  | { type: "confirmed"; bookingId: string; className: string; date: string }
  | { type: "waitlisted"; waitlistId: string; position: number; className: string; date: string; reason: string }
  | { type: "rejected"; reason: string };

/**
 * Phase 16.1 — students passed over during waitlist promotion because
 * their entitlement was no longer usable. Reported so the caller can
 * log them for admin follow-up; they stay on the waitlist in
 * `waiting` status rather than being silently dropped or promoted.
 */
export interface SkippedPromotionCandidate {
  waitlistId: string;
  studentId: string;
  studentName: string;
}

export type CancelOutcome =
  | {
      type: "cancelled";
      booking: { id: string; studentId: string; studentName: string; danceRole: DanceRole | null };
      classInfo: { id: string; title: string; date: string; startTime: string; classType: ClassType };
      cancelledAt: string;
      promoted: { studentName: string; waitlistId: string; subscriptionId: string | null } | null;
      /** Empty unless an eligibility check was supplied and rejected someone. */
      skippedIneligible?: SkippedPromotionCandidate[];
    }
  | { type: "error"; reason: string };

/**
 * Decides whether a waitlisted student may be promoted into a
 * confirmed booking. Supplied by the caller (which has repository
 * access) and evaluated BEFORE the state transition.
 */
export type WaitlistPromotionEligibility = (entry: StoredWaitlistEntry) => boolean;

// ── Service ─────────────────────────────────────────────────

export class BookingService {
  bookings: StoredBooking[];
  waitlist: StoredWaitlistEntry[];
  private classes: Map<string, ClassSnapshot>;

  constructor(
    initialBookings: StoredBooking[],
    initialWaitlist: StoredWaitlistEntry[],
    classes: ClassSnapshot[]
  ) {
    this.bookings = [...initialBookings];
    this.waitlist = [...initialWaitlist];
    this.classes = new Map(classes.map((c) => [c.id, c]));
  }

  getClass(classId: string): ClassSnapshot | undefined {
    return this.classes.get(classId);
  }

  private isActiveBooking(b: StoredBooking): boolean {
    return b.status === "confirmed" || b.status === "checked_in";
  }

  getCapacity(classId: string): BookableClassCapacity | null {
    const cls = this.classes.get(classId);
    if (!cls) return null;

    const active = this.bookings.filter(
      (b) => b.bookableClassId === classId && this.isActiveBooking(b)
    );

    return {
      classType: cls.classType,
      status: cls.status,
      danceStyleRequiresBalance: cls.danceStyleRequiresBalance,
      maxCapacity: cls.maxCapacity,
      leaderCap: cls.leaderCap,
      followerCap: cls.followerCap,
      currentLeaders: active.filter((b) => b.danceRole === "leader").length,
      currentFollowers: active.filter((b) => b.danceRole === "follower").length,
      totalBooked: active.length,
    };
  }

  bookClass(params: {
    bookableClassId: string;
    studentId: string;
    studentName: string;
    danceRole: DanceRole | null;
    source?: BookingSource;
    subscriptionId?: string | null;
    subscriptionName?: string | null;
  }): BookingOutcome {
    const cls = this.classes.get(params.bookableClassId);
    if (!cls) return { type: "rejected", reason: "Class not found." };

    if (!isBookableClassType(cls.classType)) {
      return { type: "rejected", reason: "This class type is not bookable." };
    }

    const existingBooking = this.bookings.find(
      (b) =>
        b.bookableClassId === params.bookableClassId &&
        b.studentId === params.studentId &&
        this.isActiveBooking(b)
    );
    if (existingBooking) {
      return { type: "rejected", reason: "You already have an active booking for this class." };
    }

    const cancelledBooking = this.bookings.find(
      (b) =>
        b.bookableClassId === params.bookableClassId &&
        b.studentId === params.studentId &&
        (b.status === "cancelled" || b.status === "late_cancelled")
    );
    if (cancelledBooking) {
      return { type: "rejected", reason: "You have a cancelled booking for this class. Please restore it instead." };
    }

    const existingWaitlist = this.waitlist.find(
      (w) =>
        w.bookableClassId === params.bookableClassId &&
        w.studentId === params.studentId &&
        w.status === "waiting"
    );
    if (existingWaitlist) {
      return { type: "rejected", reason: "You are already on the waitlist for this class." };
    }

    const capacity = this.getCapacity(params.bookableClassId)!;
    const decision = canBook(capacity, params.danceRole);

    if (!decision.allowed) {
      return { type: "rejected", reason: decision.reason };
    }

    const now = new Date().toISOString();

    if (decision.waitlisted) {
      const maxPos = this.waitlist
        .filter((w) => w.bookableClassId === params.bookableClassId && w.status === "waiting")
        .reduce((max, w) => Math.max(max, w.position), 0);

      const entry: StoredWaitlistEntry = {
        id: generateId("wl"),
        bookableClassId: params.bookableClassId,
        studentId: params.studentId,
        studentName: params.studentName,
        danceRole: params.danceRole,
        status: "waiting",
        position: nextWaitlistPosition(maxPos || null),
        joinedAt: now,
        promotedAt: null,
        subscriptionId: params.subscriptionId ?? null,
        subscriptionName: params.subscriptionName ?? null,
      };
      this.waitlist.push(entry);

      return {
        type: "waitlisted",
        waitlistId: entry.id,
        position: entry.position,
        className: cls.title,
        date: cls.date,
        reason: decision.reason,
      };
    }

    const booking: StoredBooking = {
      id: generateId("b"),
      bookableClassId: params.bookableClassId,
      studentId: params.studentId,
      studentName: params.studentName,
      danceRole: params.danceRole,
      status: "confirmed",
      source: params.source ?? "subscription",
      subscriptionId: params.subscriptionId ?? null,
      subscriptionName: params.subscriptionName ?? null,
      adminNote: null,
      bookedAt: now,
      cancelledAt: null,
      checkInToken: generateCheckInToken(),
    };
    this.bookings.push(booking);

    return {
      type: "confirmed",
      bookingId: booking.id,
      className: cls.title,
      date: cls.date,
    };
  }

  checkInBooking(bookingId: string): { type: "checked_in" } | { type: "error"; reason: string } {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (booking.status === "checked_in") return { type: "checked_in" };
    if (booking.status !== "confirmed") return { type: "error", reason: "Booking is not active." };
    booking.status = "checked_in";
    return { type: "checked_in" };
  }

  revertCheckIn(bookingId: string): { type: "reverted" } | { type: "error"; reason: string } {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (booking.status !== "checked_in") return { type: "error", reason: "Booking is not checked in." };
    booking.status = "confirmed";
    return { type: "reverted" };
  }

  /**
   * @param isEligible Phase 16.1 — gate applied to waitlist
   *        promotion BEFORE the confirmed booking is created. Omit
   *        only where no entitlement is involved.
   */
  cancelBooking(
    bookingId: string,
    cancelledAt?: Date,
    isEligible?: WaitlistPromotionEligibility,
  ): CancelOutcome {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (!this.isActiveBooking(booking)) {
      return { type: "error", reason: "Booking is not active." };
    }

    const cls = this.classes.get(booking.bookableClassId);
    if (!cls) return { type: "error", reason: "Class not found." };

    const now = cancelledAt ?? new Date();
    booking.status = "cancelled";
    booking.cancelledAt = now.toISOString();

    const bookingInfo = {
      id: booking.id,
      studentId: booking.studentId,
      studentName: booking.studentName,
      danceRole: booking.danceRole,
    };
    const classInfo = {
      id: cls.id,
      title: cls.title,
      date: cls.date,
      startTime: cls.startTime,
      classType: cls.classType,
    };

    const { promoted, skippedIneligible } = this.promoteNextEligible(
      booking.bookableClassId,
      booking.danceRole,
      isEligible,
    );

    return {
      type: "cancelled",
      booking: bookingInfo,
      classInfo,
      cancelledAt: now.toISOString(),
      promoted,
      skippedIneligible,
    };
  }

  /**
   * Phase 16.1 — shared waitlist-promotion step.
   *
   * Previously this logic was duplicated verbatim in `cancelBooking`
   * and `cancelBookingAsAdmin`, and neither consulted the promoted
   * student's entitlement. The caller only discovered the problem
   * afterwards, when `consumeEntitlementCredit` refused — by which
   * point a CONFIRMED booking already existed, handing out a free
   * class.
   *
   * The eligibility check now runs before any state transition: an
   * ineligible candidate is skipped, the search moves to the next
   * student in the queue, and skipped students stay `waiting`.
   */
  private promoteNextEligible(
    bookableClassId: string,
    freedRole: DanceRole | null,
    isEligible?: WaitlistPromotionEligibility,
  ): {
    promoted: { studentName: string; waitlistId: string; subscriptionId: string | null } | null;
    skippedIneligible: SkippedPromotionCandidate[];
  } {
    const capacity = this.getCapacity(bookableClassId);
    if (!capacity) return { promoted: null, skippedIneligible: [] };

    const classWaitlist = this.waitlist.filter(
      (w) => w.bookableClassId === bookableClassId,
    );
    const byId = new Map(classWaitlist.map((w) => [w.id, w]));

    const result = findPromotionCandidate(
      classWaitlist.map((w) => ({
        id: w.id,
        studentId: w.studentId,
        danceRole: w.danceRole,
        position: w.position,
        status: w.status,
      })),
      freedRole,
      capacity,
      isEligible ? (e) => { const full = byId.get(e.id); return full ? isEligible(full) : false; } : undefined,
    );

    const toSkipped = (entries: { id: string; studentId: string }[]): SkippedPromotionCandidate[] =>
      entries.map((e) => ({
        waitlistId: e.id,
        studentId: e.studentId,
        studentName: byId.get(e.id)?.studentName ?? "Unknown student",
      }));

    if (!result) {
      // Nobody was promoted. Report anyone who WOULD have been but
      // for their entitlement, so the admin can follow up rather
      // than wondering why a free spot went unfilled.
      const skipped = isEligible
        ? findIneligibleCandidates(
            classWaitlist.map((w) => ({
              id: w.id,
              studentId: w.studentId,
              danceRole: w.danceRole,
              position: w.position,
              status: w.status,
            })),
            (e) => { const full = byId.get(e.id); return full ? isEligible(full) : false; },
          )
        : [];
      return { promoted: null, skippedIneligible: toSkipped(skipped) };
    }

    const entry = byId.get(result.promoted.id);
    if (!entry) return { promoted: null, skippedIneligible: toSkipped(result.skippedIneligible) };

    entry.status = "promoted";
    entry.promotedAt = new Date().toISOString();

    this.bookings.push({
      id: generateId("b"),
      bookableClassId,
      studentId: entry.studentId,
      studentName: entry.studentName,
      danceRole: entry.danceRole,
      status: "confirmed",
      source: "waitlist_promotion",
      subscriptionId: entry.subscriptionId,
      subscriptionName: entry.subscriptionName,
      adminNote: null,
      bookedAt: new Date().toISOString(),
      cancelledAt: null,
      checkInToken: generateCheckInToken(),
    });

    const remaining = this.waitlist.filter(
      (w) => w.bookableClassId === bookableClassId && w.status === "waiting",
    );
    for (const r of reindexPositions(remaining)) {
      const original = this.waitlist.find((w) => w.id === r.id);
      if (original) original.position = r.position;
    }

    return {
      promoted: {
        studentName: entry.studentName,
        waitlistId: entry.id,
        subscriptionId: entry.subscriptionId,
      },
      skippedIneligible: toSkipped(result.skippedIneligible),
    };
  }

  getWaitlistForClass(classId: string): StoredWaitlistEntry[] {
    return this.waitlist
      .filter((w) => w.bookableClassId === classId && w.status === "waiting")
      .sort((a, b) => a.position - b.position);
  }

  getConfirmedBookingsForClass(classId: string): StoredBooking[] {
    return this.bookings.filter(
      (b) => b.bookableClassId === classId && this.isActiveBooking(b)
    );
  }

  getBookingsForStudent(studentId: string): StoredBooking[] {
    return this.bookings.filter((b) => b.studentId === studentId);
  }

  getWaitlistForStudent(studentId: string): StoredWaitlistEntry[] {
    return this.waitlist.filter(
      (w) => w.studentId === studentId && w.status === "waiting"
    );
  }

  // ── Admin methods ────────────────────────────────────────────

  getAllBookings(): StoredBooking[] {
    return [...this.bookings];
  }

  getAllWaitlist(): StoredWaitlistEntry[] {
    return [...this.waitlist];
  }

  adminBook(params: {
    bookableClassId: string;
    studentId: string;
    studentName: string;
    danceRole: DanceRole | null;
    source: BookingSource;
    subscriptionId?: string | null;
    subscriptionName?: string | null;
    adminNote?: string | null;
    forceConfirm?: boolean;
  }): BookingOutcome {
    const cls = this.classes.get(params.bookableClassId);
    if (!cls) return { type: "rejected", reason: "Class not found." };

    const existingBooking = this.bookings.find(
      (b) =>
        b.bookableClassId === params.bookableClassId &&
        b.studentId === params.studentId &&
        this.isActiveBooking(b)
    );
    if (existingBooking) {
      return { type: "rejected", reason: "Student already has an active booking for this class." };
    }

    const now = new Date().toISOString();
    const capacity = this.getCapacity(params.bookableClassId)!;
    const decision = canBook(capacity, params.danceRole, { skipStatusCheck: true });

    if (!decision.allowed && !params.forceConfirm) {
      return { type: "rejected", reason: decision.reason };
    }

    const shouldWaitlist = decision.waitlisted && !params.forceConfirm;

    if (shouldWaitlist) {
      const maxPos = this.waitlist
        .filter((w) => w.bookableClassId === params.bookableClassId && w.status === "waiting")
        .reduce((max, w) => Math.max(max, w.position), 0);

      const entry: StoredWaitlistEntry = {
        id: generateId("wl"),
        bookableClassId: params.bookableClassId,
        studentId: params.studentId,
        studentName: params.studentName,
        danceRole: params.danceRole,
        status: "waiting",
        position: nextWaitlistPosition(maxPos || null),
        joinedAt: now,
        promotedAt: null,
        subscriptionId: params.subscriptionId ?? null,
        subscriptionName: params.subscriptionName ?? null,
      };
      this.waitlist.push(entry);

      return {
        type: "waitlisted",
        waitlistId: entry.id,
        position: entry.position,
        className: cls.title,
        date: cls.date,
        reason: decision.reason,
      };
    }

    const booking: StoredBooking = {
      id: generateId("b"),
      bookableClassId: params.bookableClassId,
      studentId: params.studentId,
      studentName: params.studentName,
      danceRole: params.danceRole,
      status: "confirmed",
      source: params.source,
      subscriptionId: params.subscriptionId ?? null,
      subscriptionName: params.subscriptionName ?? null,
      adminNote: params.adminNote ?? null,
      bookedAt: now,
      cancelledAt: null,
      checkInToken: generateCheckInToken(),
    };
    this.bookings.push(booking);

    return {
      type: "confirmed",
      bookingId: booking.id,
      className: cls.title,
      date: cls.date,
    };
  }

  /** @param isEligible See {@link BookingService.cancelBooking}. */
  cancelBookingAsAdmin(
    bookingId: string,
    isLate: boolean,
    isEligible?: WaitlistPromotionEligibility,
  ): CancelOutcome {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (!this.isActiveBooking(booking)) {
      return { type: "error", reason: "Booking is not active." };
    }

    const cls = this.classes.get(booking.bookableClassId);
    if (!cls) return { type: "error", reason: "Class not found." };

    const now = new Date();
    booking.status = isLate ? "late_cancelled" : "cancelled";
    booking.cancelledAt = now.toISOString();

    const bookingInfo = {
      id: booking.id,
      studentId: booking.studentId,
      studentName: booking.studentName,
      danceRole: booking.danceRole,
    };
    const classInfo = {
      id: cls.id,
      title: cls.title,
      date: cls.date,
      startTime: cls.startTime,
      classType: cls.classType,
    };

    const { promoted, skippedIneligible } = this.promoteNextEligible(
      booking.bookableClassId,
      booking.danceRole,
      isEligible,
    );

    return {
      type: "cancelled",
      booking: bookingInfo,
      classInfo,
      cancelledAt: now.toISOString(),
      promoted,
      skippedIneligible,
    };
  }

  /**
   * Promote one specific waitlist entry (admin picks the student).
   *
   * @param isEligible Phase 16.1 — refuses the promotion outright
   *        when the student's entitlement is no longer usable.
   *        Unlike the cancel paths there is no "next candidate" to
   *        fall through to: the admin chose this person, so the
   *        correct outcome is a clear error they can act on.
   */
  promoteFromWaitlist(
    waitlistId: string,
    isEligible?: WaitlistPromotionEligibility,
  ): { type: "promoted"; bookingId: string; subscriptionId: string | null } | { type: "error"; reason: string } {
    const entry = this.waitlist.find((w) => w.id === waitlistId && w.status === "waiting");
    if (!entry) return { type: "error", reason: "Waitlist entry not found or already promoted." };

    if (isEligible && !isEligible(entry)) {
      return {
        type: "error",
        reason: `${entry.studentName} no longer has a usable entitlement for this class, so they cannot be promoted. Assign a new pass or renew their existing one first.`,
      };
    }

    entry.status = "promoted";
    entry.promotedAt = new Date().toISOString();

    const booking: StoredBooking = {
      id: generateId("b"),
      bookableClassId: entry.bookableClassId,
      studentId: entry.studentId,
      studentName: entry.studentName,
      danceRole: entry.danceRole,
      status: "confirmed",
      source: "waitlist_promotion",
      subscriptionId: entry.subscriptionId,
      subscriptionName: entry.subscriptionName,
      adminNote: null,
      bookedAt: new Date().toISOString(),
      cancelledAt: null,
      checkInToken: generateCheckInToken(),
    };
    this.bookings.push(booking);

    const remaining = this.waitlist.filter(
      (w) => w.bookableClassId === entry.bookableClassId && w.status === "waiting"
    );
    const reindexed = reindexPositions(remaining);
    for (const r of reindexed) {
      const original = this.waitlist.find((w) => w.id === r.id);
      if (original) original.position = r.position;
    }

    return { type: "promoted", bookingId: booking.id, subscriptionId: entry.subscriptionId };
  }

  removeFromWaitlist(waitlistId: string): boolean {
    const idx = this.waitlist.findIndex((w) => w.id === waitlistId && w.status === "waiting");
    if (idx === -1) return false;

    const classId = this.waitlist[idx].bookableClassId;
    this.waitlist.splice(idx, 1);

    const remaining = this.waitlist.filter(
      (w) => w.bookableClassId === classId && w.status === "waiting"
    );
    const reindexed = reindexPositions(remaining);
    for (const r of reindexed) {
      const original = this.waitlist.find((w) => w.id === r.id);
      if (original) original.position = r.position;
    }

    return true;
  }

  restoreBooking(
    bookingId: string
  ):
    | { type: "restored"; restoredTo: "confirmed" | "waitlisted" }
    | { type: "error"; reason: string } {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (booking.status !== "cancelled" && booking.status !== "late_cancelled") {
      return { type: "error", reason: "Only cancelled bookings can be restored." };
    }

    const capacity = this.getCapacity(booking.bookableClassId);
    if (!capacity) {
      booking.status = "confirmed";
      booking.cancelledAt = null;
      booking.checkInToken = generateCheckInToken();
      return { type: "restored", restoredTo: "confirmed" };
    }

    const decision = canBook(capacity, booking.danceRole);

    if (decision.allowed && !decision.waitlisted) {
      booking.status = "confirmed";
      booking.cancelledAt = null;
      booking.checkInToken = generateCheckInToken();
      return { type: "restored", restoredTo: "confirmed" };
    }

    if (decision.waitlisted || !decision.allowed) {
      const maxPos = this.waitlist
        .filter((w) => w.bookableClassId === booking.bookableClassId && w.status === "waiting")
        .reduce((max, w) => Math.max(max, w.position), 0);

      const entry: StoredWaitlistEntry = {
        id: generateId("wl"),
        bookableClassId: booking.bookableClassId,
        studentId: booking.studentId,
        studentName: booking.studentName,
        danceRole: booking.danceRole,
        status: "waiting",
        position: nextWaitlistPosition(maxPos || null),
        joinedAt: new Date().toISOString(),
        promotedAt: null,
        subscriptionId: booking.subscriptionId,
        subscriptionName: booking.subscriptionName,
      };
      this.waitlist.push(entry);

      booking.status = "cancelled";
      return { type: "restored", restoredTo: "waitlisted" };
    }

    return { type: "error", reason: "Class is full and cannot be waitlisted." };
  }

  /**
   * Transition a confirmed booking to "missed" after the attendance
   * closure window has passed without a check-in.
   */
  markMissed(bookingId: string): { type: "missed" } | { type: "error"; reason: string } {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (booking.status !== "confirmed") {
      return { type: "error", reason: "Only confirmed bookings can be marked as missed." };
    }
    booking.status = "missed";
    return { type: "missed" };
  }

  /**
   * Set booking to "missed" from any active state (confirmed or checked_in).
   * Used by attendance absent marking.
   */
  markMissedFromAttendance(bookingId: string): { type: "missed" } | { type: "error"; reason: string } {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (booking.status !== "confirmed" && booking.status !== "checked_in") {
      return { type: "error", reason: "Booking is not in an active state." };
    }
    booking.status = "missed";
    return { type: "missed" };
  }

  /**
   * Restore a missed booking to checked_in (used when attendance changes
   * from absent/excused back to present/late).
   */
  restoreFromMissed(bookingId: string): { type: "restored" } | { type: "error"; reason: string } {
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) return { type: "error", reason: "Booking not found." };
    if (booking.status !== "missed" && booking.status !== "confirmed") {
      return { type: "error", reason: "Booking is not in a restorable state." };
    }
    booking.status = "checked_in";
    return { type: "restored" };
  }

  /**
   * Get all confirmed (not checked-in) bookings for a given class.
   * Used by attendance closure to find bookings that should become "missed".
   */
  getUncheckedBookingsForClass(classId: string): StoredBooking[] {
    return this.bookings.filter(
      (b) => b.bookableClassId === classId && b.status === "confirmed"
    );
  }

  deleteBooking(bookingId: string): boolean {
    const idx = this.bookings.findIndex((b) => b.id === bookingId);
    if (idx === -1) return false;
    this.bookings.splice(idx, 1);
    return true;
  }

  findByCheckInToken(token: string): StoredBooking | undefined {
    return this.bookings.find((b) => b.checkInToken === token);
  }

  refreshClasses(classes: ClassSnapshot[]) {
    this.classes = new Map(classes.map((c) => [c.id, c]));
  }
}
