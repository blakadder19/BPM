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
  reindexPositions,
} from "@/lib/domain/waitlist-rules";
import { generateId } from "@/lib/utils";
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
  subscriptionName: string | null;
  adminNote: string | null;
  bookedAt: string;
  cancelledAt: string | null;
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

export type CancelOutcome =
  | {
      type: "cancelled";
      booking: { id: string; studentId: string; studentName: string; danceRole: DanceRole | null };
      classInfo: { id: string; title: string; date: string; startTime: string; classType: ClassType };
      cancelledAt: string;
      promoted: { studentName: string; waitlistId: string } | null;
    }
  | { type: "error"; reason: string };

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
        .filter((w) => w.bookableClassId === params.bookableClassId)
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
      subscriptionName: params.subscriptionName ?? null,
      adminNote: null,
      bookedAt: now,
      cancelledAt: null,
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

  cancelBooking(bookingId: string, cancelledAt?: Date): CancelOutcome {
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

    const capacity = this.getCapacity(booking.bookableClassId);
    if (!capacity) {
      return { type: "cancelled", booking: bookingInfo, classInfo, cancelledAt: now.toISOString(), promoted: null };
    }

    const classWaitlist = this.waitlist.filter(
      (w) => w.bookableClassId === booking.bookableClassId
    );

    const result = findPromotionCandidate(
      classWaitlist.map((w) => ({
        id: w.id,
        studentId: w.studentId,
        danceRole: w.danceRole,
        position: w.position,
        status: w.status,
      })),
      booking.danceRole,
      capacity
    );

    let promoted: { studentName: string; waitlistId: string } | null = null;

    if (result) {
      const entry = this.waitlist.find((w) => w.id === result.promoted.id);
      if (entry) {
        entry.status = "promoted";
        entry.promotedAt = new Date().toISOString();

        const newBooking: StoredBooking = {
          id: generateId("b"),
          bookableClassId: booking.bookableClassId,
          studentId: entry.studentId,
          studentName: entry.studentName,
          danceRole: entry.danceRole,
          status: "confirmed",
          source: "waitlist_promotion",
          subscriptionName: null,
          adminNote: null,
          bookedAt: new Date().toISOString(),
          cancelledAt: null,
        };
        this.bookings.push(newBooking);

        promoted = { studentName: entry.studentName, waitlistId: entry.id };

        const remaining = this.waitlist.filter(
          (w) => w.bookableClassId === booking.bookableClassId && w.status === "waiting"
        );
        const reindexed = reindexPositions(remaining);
        for (const r of reindexed) {
          const original = this.waitlist.find((w) => w.id === r.id);
          if (original) original.position = r.position;
        }
      }
    }

    return { type: "cancelled", booking: bookingInfo, classInfo, cancelledAt: now.toISOString(), promoted };
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
    const decision = canBook(capacity, params.danceRole);

    if (!decision.allowed && !params.forceConfirm) {
      return { type: "rejected", reason: decision.reason };
    }

    const shouldWaitlist = decision.waitlisted && !params.forceConfirm;

    if (shouldWaitlist) {
      const maxPos = this.waitlist
        .filter((w) => w.bookableClassId === params.bookableClassId)
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
      subscriptionName: params.subscriptionName ?? null,
      adminNote: params.adminNote ?? null,
      bookedAt: now,
      cancelledAt: null,
    };
    this.bookings.push(booking);

    return {
      type: "confirmed",
      bookingId: booking.id,
      className: cls.title,
      date: cls.date,
    };
  }

  cancelBookingAsAdmin(bookingId: string, isLate: boolean): CancelOutcome {
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

    const capacity = this.getCapacity(booking.bookableClassId);
    if (!capacity) {
      return { type: "cancelled", booking: bookingInfo, classInfo, cancelledAt: now.toISOString(), promoted: null };
    }

    const classWaitlist = this.waitlist.filter(
      (w) => w.bookableClassId === booking.bookableClassId
    );
    const result = findPromotionCandidate(
      classWaitlist.map((w) => ({
        id: w.id,
        studentId: w.studentId,
        danceRole: w.danceRole,
        position: w.position,
        status: w.status,
      })),
      booking.danceRole,
      capacity
    );

    let promoted: { studentName: string; waitlistId: string } | null = null;

    if (result) {
      const entry = this.waitlist.find((w) => w.id === result.promoted.id);
      if (entry) {
        entry.status = "promoted";
        entry.promotedAt = new Date().toISOString();

        const newBooking: StoredBooking = {
          id: generateId("b"),
          bookableClassId: booking.bookableClassId,
          studentId: entry.studentId,
          studentName: entry.studentName,
          danceRole: entry.danceRole,
          status: "confirmed",
          source: "waitlist_promotion",
          subscriptionName: null,
          adminNote: null,
          bookedAt: new Date().toISOString(),
          cancelledAt: null,
        };
        this.bookings.push(newBooking);
        promoted = { studentName: entry.studentName, waitlistId: entry.id };

        const remaining = this.waitlist.filter(
          (w) => w.bookableClassId === booking.bookableClassId && w.status === "waiting"
        );
        const reindexed = reindexPositions(remaining);
        for (const r of reindexed) {
          const original = this.waitlist.find((w) => w.id === r.id);
          if (original) original.position = r.position;
        }
      }
    }

    return { type: "cancelled", booking: bookingInfo, classInfo, cancelledAt: now.toISOString(), promoted };
  }

  promoteFromWaitlist(waitlistId: string): { type: "promoted"; bookingId: string } | { type: "error"; reason: string } {
    const entry = this.waitlist.find((w) => w.id === waitlistId && w.status === "waiting");
    if (!entry) return { type: "error", reason: "Waitlist entry not found or already promoted." };

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
      subscriptionName: null,
      adminNote: null,
      bookedAt: new Date().toISOString(),
      cancelledAt: null,
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

    return { type: "promoted", bookingId: booking.id };
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
      return { type: "restored", restoredTo: "confirmed" };
    }

    const decision = canBook(capacity, booking.danceRole);

    if (decision.allowed && !decision.waitlisted) {
      booking.status = "confirmed";
      booking.cancelledAt = null;
      return { type: "restored", restoredTo: "confirmed" };
    }

    if (decision.waitlisted || !decision.allowed) {
      const maxPos = this.waitlist
        .filter((w) => w.bookableClassId === booking.bookableClassId)
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
      };
      this.waitlist.push(entry);

      booking.status = "cancelled";
      return { type: "restored", restoredTo: "waitlisted" };
    }

    return { type: "error", reason: "Class is full and cannot be waitlisted." };
  }

  refreshClasses(classes: ClassSnapshot[]) {
    this.classes = new Map(classes.map((c) => [c.id, c]));
  }
}
