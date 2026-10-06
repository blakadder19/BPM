/**
 * Write guards that sit under a broad page permission:
 *   - `students:edit` edits the entitlement but never payment status, and
 *     never overwrites payment details the caller was not shown;
 *   - each attendance status needs its own key, the actor comes from the
 *     session, and booking/subscription ids must belong to the student.
 * Uses the real staff-access resolver.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";
import { ROLE_PRESETS, type Permission, type StaffRoleKey } from "@/lib/domain/permissions";

const h = vi.hoisted(() => ({
  user: null as AuthUser | null,
  row: null as StaffMember | null,
  subs: new Map<string, Record<string, unknown>>(),
  updateSubscription: vi.fn(),
  priorMark: null as { status: string } | null,
  bookings: [] as { id: string; studentId: string; bookableClassId: string; status: string; subscriptionId: string | null; checkInToken?: string }[],
  instances: [] as { id: string; title: string; classType: string; styleId: string | null; level: string | null; date: string; startTime: string; endTime: string }[],
  markAttendance: vi.fn(),
  checkInBooking: vi.fn(),
  restoreFromMissed: vi.fn(),
  markMissedFromAttendance: vi.fn(),
  assessNoShowPenalty: vi.fn(),
  updateResolution: vi.fn(),
  saveAttendanceToDB: vi.fn(),
  saveBookingToDB: vi.fn(),
  savePenaltyToDB: vi.fn(),
  updatePenaltyInDB: vi.fn(),
  createSubscription: vi.fn(),
  priceProductForStudent: vi.fn(),
  updateStudent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!h.user) throw new Error("REDIRECT:/login");
    return h.user;
  },
  getAuthUser: async () => h.user,
}));
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => h.row }),
  getSubscriptionRepo: () => ({ getById: async (id: string) => h.subs.get(id) ?? null }),
  getStudentRepo: () => ({ getById: async (id: string) => ({ id, fullName: "Real Name" }) }),
  getProductRepo: () => ({
    getById: async (id: string) =>
      id === "p-pass"
        ? { id, name: "Bronze Class Pass", productType: "pass", priceCents: 5500, termBound: false, spanTerms: null, durationDays: 30, totalCredits: 4, classesPerTerm: null, allowMultipleActivePurchases: true }
        : null,
  }),
  getTermRepo: () => ({ getById: async () => null, getAll: async () => [] }),
}));
vi.mock("@/lib/services/subscription-service", () => ({
  createSubscription: h.createSubscription,
  updateSubscription: h.updateSubscription,
}));
vi.mock("@/lib/services/student-service", () => ({
  createStudent: vi.fn(),
  updateStudent: h.updateStudent,
  toggleStudentActive: vi.fn(),
  deleteStudent: vi.fn(),
}));
vi.mock("@/lib/services/subscription-snapshot-service", () => ({ buildSnapshotFromProduct: vi.fn(async () => null) }));
vi.mock("@/lib/services/pricing-service", () => ({
  priceProductForStudent: h.priceProductForStudent,
  buildAuditDiscountMetadata: vi.fn(),
  releaseDiscountClaim: vi.fn(),
  attachClaimRelations: vi.fn(),
  resolveVatFor: vi.fn(() => ({ vatApplied: false })),
}));
vi.mock("@/lib/supabase/hydrate-operational", () => ({
  ensureOperationalDataHydrated: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: vi.fn() }));
vi.mock("@/lib/communications/builders", () => ({
  paymentPendingEvent: vi.fn(),
  paymentConfirmedEvent: vi.fn(),
  subscriptionRefundedEvent: vi.fn(),
}));
vi.mock("@/lib/communications/dispatch", () => ({ dispatchCommEvents: vi.fn(async () => {}) }));
vi.mock("@/lib/communications/notification-store", () => ({
  dismissNotificationsForSubscription: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/booking-store", () => ({
  getBookingService: () => ({
    bookings: h.bookings,
    checkInBooking: h.checkInBooking,
    findByCheckInToken: (token: string) => h.bookings.find((b) => b.checkInToken === token),
    getClass: (id: string) => h.instances.find((c) => c.id === id),
    refreshClasses: vi.fn(),
    restoreFromMissed: h.restoreFromMissed,
    markMissedFromAttendance: h.markMissedFromAttendance,
  }),
}));
vi.mock("@/lib/services/attendance-store", () => ({
  getAttendanceService: () => ({
    getRecord: () => h.priorMark,
    markAttendance: h.markAttendance,
  }),
}));
vi.mock("@/lib/services/penalty-store", () => ({
  getPenaltyService: () => ({
    getAllPenalties: () => [
      { id: "pen-1", bookableClassId: "c-past", studentId: "s-1", reason: "no_show", resolution: "monetary_pending" },
      { id: "pen-2", bookableClassId: "c-ended", studentId: "s-1", reason: "no_show", resolution: "monetary_pending" },
    ],
    assessNoShowPenalty: h.assessNoShowPenalty,
    updateResolution: h.updateResolution,
  }),
}));
vi.mock("@/lib/supabase/operational-persistence", () => ({
  saveAttendanceToDB: h.saveAttendanceToDB,
  saveBookingToDB: h.saveBookingToDB,
  savePenaltyToDB: h.savePenaltyToDB,
  updatePenaltyInDB: h.updatePenaltyInDB,
  deleteAttendanceFromDB: vi.fn(),
}));
vi.mock("@/lib/utils/is-real-user", () => ({ isRealUser: () => true }));
vi.mock("@/lib/services/schedule-store", () => ({ getInstances: () => h.instances }));
vi.mock("@/lib/services/settings-store", () => ({ getSettings: () => ({ refundCreditOnAbsent: false, attendanceClosureMinutes: 60, selfCheckInEnabled: true, selfCheckInOpensMinutesBefore: 30 }) }));
vi.mock("@/lib/services/term-store", () => ({ getTerms: () => [] }));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@/lib/services/entitlement-consumption", () => ({ consumeEntitlementCredit: vi.fn() }));

function signIn(roleKey: StaffRoleKey | null, permissions: readonly Permission[] = []) {
  h.user = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Session Staff",
    role: roleKey === "teacher" ? "teacher" : "admin",
    avatarUrl: null,
    academyId: "a-1",
    emailConfirmed: true,
  };
  h.row = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Session Staff",
    legacyRole: h.user.role,
    roleKey,
    permissions: [...permissions],
    status: "active",
    invitedBy: null,
    updatedAt: null,
    createdAt: null,
  };
}

beforeEach(() => {
  vi.resetModules();
  h.user = null;
  h.row = null;
  h.subs.clear();
  h.updateSubscription.mockReset();
  h.updateSubscription.mockResolvedValue({ success: true });
  h.priorMark = null;
  h.bookings.length = 0;
  for (const fn of [
    h.markAttendance, h.checkInBooking, h.restoreFromMissed, h.markMissedFromAttendance,
    h.assessNoShowPenalty, h.updateResolution, h.saveAttendanceToDB, h.saveBookingToDB,
    h.savePenaltyToDB, h.updatePenaltyInDB, h.createSubscription, h.priceProductForStudent,
    h.updateStudent,
  ]) fn.mockReset();
  h.createSubscription.mockResolvedValue({ success: true, subscriptionId: "sub-new" });
  h.priceProductForStudent.mockResolvedValue({
    basePriceCents: 5500,
    finalPriceCents: 5500,
    totalDiscountCents: 0,
    appliedDiscounts: [],
    snapshot: null,
    claim: null,
    vat: { vatApplied: false },
  });
  h.updateStudent.mockResolvedValue({ success: true });
  h.markAttendance.mockReturnValue({ type: "created", record: { source: "booking", subscriptionId: null } });
  h.assessNoShowPenalty.mockReturnValue({ penaltyCreated: false, description: null, penalty: null });
});

// ── updateSubscriptionAction ─────────────────────────────────

function sub(over: Record<string, unknown> = {}) {
  const s = {
    id: "sub-1",
    studentId: "s-1",
    status: "active",
    paymentStatus: "pending",
    paymentMethod: "cash",
    refundedAmountCents: 0,
    stripeRefundId: null,
    ...over,
  };
  h.subs.set(s.id, s);
  return s;
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("id", "sub-1");
  fd.set("status", "active");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function updateSub(fields: Record<string, string>) {
  const { updateSubscriptionAction } = await import("../subscriptions");
  return updateSubscriptionAction(form(fields));
}

describe("updateSubscriptionAction — payment status needs a payment permission", () => {
  it("students:edit alone cannot mark a pending subscription paid", async () => {
    signIn("custom", ["students:edit"]);
    sub();
    const res = await updateSub({ paymentStatus: "paid" });
    expect(res.success).toBe(false);
    expect(h.updateSubscription).not.toHaveBeenCalled();
  });

  it("students:edit alone cannot waive or cancel a payment", async () => {
    signIn("custom", ["students:edit", "payments:mark_paid_reception"]);
    sub();
    for (const paymentStatus of ["complimentary", "waived", "cancelled"]) {
      const res = await updateSub({ paymentStatus });
      expect(res.success).toBe(false);
    }
    expect(h.updateSubscription).not.toHaveBeenCalled();
  });

  it("the reception permission can mark pending → paid", async () => {
    signIn("custom", ["students:edit", "payments:mark_paid_reception"]);
    sub();
    const res = await updateSub({ paymentStatus: "paid" });
    expect(res.success).toBe(true);
    expect(h.updateSubscription).toHaveBeenCalledWith(
      "sub-1",
      expect.objectContaining({ paymentStatus: "paid" }),
    );
  });

  it("a Stripe-paid subscription cannot be marked refunded from the edit form", async () => {
    signIn("custom", ["students:edit", "students:view_finance", "finance:refund"]);
    sub({ paymentStatus: "paid", paymentMethod: "stripe" });
    const res = await updateSub({ paymentStatus: "refunded" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Stripe/);
    expect(h.updateSubscription).not.toHaveBeenCalled();
  });

  it("an unchanged payment status saves entitlement edits with students:edit", async () => {
    signIn("custom", ["students:edit"]);
    sub({ paymentStatus: "paid" });
    const res = await updateSub({ paymentStatus: "paid", notes: "moved to Tuesday" });
    expect(res.success).toBe(true);
    const patch = h.updateSubscription.mock.calls[0][1];
    expect(patch).not.toHaveProperty("paymentStatus");
  });

  it("without students:view_finance the form never overwrites payment details", async () => {
    signIn("custom", ["students:edit"]);
    sub({ paymentStatus: "paid" });
    await updateSub({ paymentStatus: "paid", paymentMethod: "revolut", paymentReference: "", paidAt: "" });
    const patch = h.updateSubscription.mock.calls[0][1];
    for (const k of ["paymentMethod", "paymentReference", "paymentNotes", "paidAt", "collectedBy"]) {
      expect(patch).not.toHaveProperty(k);
    }
  });

  it("with students:view_finance payment details are saved", async () => {
    signIn("custom", ["students:edit", "students:view_finance"]);
    sub({ paymentStatus: "paid" });
    await updateSub({ paymentStatus: "paid", paymentReference: "REV-1" });
    expect(h.updateSubscription.mock.calls[0][1]).toMatchObject({ paymentReference: "REV-1" });
  });
});

// ── markStudentAttendance ────────────────────────────────────

// Clock: 2026-10-01 17:00 UTC = 18:00 Europe/Dublin (IST).
const NOW = new Date("2026-10-01T17:00:00Z");
const CLASSES = {
  open: { id: "c-today", date: "2026-10-01", startTime: "19:00", endTime: "20:00" },
  live: { id: "c-live", date: "2026-10-01", startTime: "17:30", endTime: "18:30" },
  ended: { id: "c-ended", date: "2026-10-01", startTime: "16:00", endTime: "17:00" },
  past: { id: "c-past", date: "2026-09-30", startTime: "19:00", endTime: "20:00" },
  future: { id: "c-future", date: "2026-10-02", startTime: "19:00", endTime: "20:00" },
} as const;
type ClassKey = keyof typeof CLASSES;

function seedSchedule() {
  h.instances = Object.values(CLASSES).map((c) => ({
    ...c,
    title: `Bachata ${c.id}`,
    classType: "class",
    styleId: "style-bachata",
    level: "1",
  }));
  for (const c of Object.values(CLASSES)) {
    h.bookings.push({ id: `b-${c.id}`, studentId: "s-1", bookableClassId: c.id, status: "confirmed", subscriptionId: "sub-att" });
  }
  h.subs.set("sub-att", { id: "sub-att", studentId: "s-1", paymentStatus: "paid", classesUsed: 1, classesPerTerm: 8, remainingCredits: 7 });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  seedSchedule();
});
afterEach(() => {
  vi.useRealTimers();
});

async function mark(over: Record<string, unknown> = {}) {
  const { markStudentAttendance } = await import("../attendance");
  return markStudentAttendance({
    bookableClassId: CLASSES.open.id,
    studentId: "s-1",
    studentName: "Spoofed Name",
    bookingId: `b-${CLASSES.open.id}`,
    classTitle: "Spoofed Title",
    date: "2026-10-01",
    classType: "class",
    danceStyleId: null,
    level: null,
    status: "present",
    markedBy: "Someone Else",
    ...over,
  } as Parameters<typeof markStudentAttendance>[0]);
}

/** Mark against a booked class, sending a spoofed "today" date. */
function markClass(key: ClassKey, status: "present" | "absent", over: Record<string, unknown> = {}) {
  const c = CLASSES[key];
  return mark({ bookableClassId: c.id, bookingId: `b-${c.id}`, date: "2026-10-01", status, ...over });
}

function expectNoSideEffects() {
  expect(h.markAttendance).not.toHaveBeenCalled();
  expect(h.checkInBooking).not.toHaveBeenCalled();
  expect(h.restoreFromMissed).not.toHaveBeenCalled();
  expect(h.markMissedFromAttendance).not.toHaveBeenCalled();
  expect(h.assessNoShowPenalty).not.toHaveBeenCalled();
  expect(h.updateResolution).not.toHaveBeenCalled();
  expect(h.updateSubscription).not.toHaveBeenCalled();
  expect(h.saveAttendanceToDB).not.toHaveBeenCalled();
  expect(h.saveBookingToDB).not.toHaveBeenCalled();
  expect(h.savePenaltyToDB).not.toHaveBeenCalled();
  expect(h.updatePenaltyInDB).not.toHaveBeenCalled();
}

const TEACHER_WITH_HISTORY: Permission[] = [...ROLE_PRESETS.teacher, "attendance:edit_history"];

describe("markStudentAttendance — class timing (Teacher defaults)", () => {
  for (const status of ["present", "absent"] as const) {
    it(`allows ${status} for today's class that has not started`, async () => {
      signIn("teacher", ROLE_PRESETS.teacher);
      expect((await markClass("open", status)).success).toBe(true);
      expect(h.markAttendance).toHaveBeenCalledTimes(1);
    });

    it(`allows ${status} for today's class that is in progress`, async () => {
      signIn("teacher", ROLE_PRESETS.teacher);
      expect((await markClass("live", status)).success).toBe(true);
    });

    it(`denies ${status} for an earlier day without edit_history`, async () => {
      signIn("teacher", ROLE_PRESETS.teacher);
      const res = await markClass("past", status);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/edit_history/);
      expectNoSideEffects();
    });

    it(`denies ${status} for a class that ended today without edit_history`, async () => {
      signIn("teacher", ROLE_PRESETS.teacher);
      const res = await markClass("ended", status);
      expect(res.success).toBe(false);
      expectNoSideEffects();
    });

    it(`denies ${status} for a future class`, async () => {
      signIn("teacher", ROLE_PRESETS.teacher);
      const res = await markClass("future", status);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/future/);
      expectNoSideEffects();
    });
  }

  it("denies voiding a past no-show fee (absent → present) without edit_history", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    h.priorMark = { status: "absent" };
    const res = await markClass("past", "present");
    expect(res.success).toBe(false);
    expectNoSideEffects();
  });

  it("ignores a caller-supplied date: a past class sent as today is still historical", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    const res = await markClass("past", "present", { date: "2026-10-01" });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown class id", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    const res = await mark({ bookableClassId: "c-missing", bookingId: null });
    expect(res.success).toBe(false);
    expectNoSideEffects();
  });

  it("stores the canonical class fields, not the caller's", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    await markClass("open", "present", { classTitle: "Spoofed", date: "2026-12-25" });
    expect(h.markAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-10-01", classTitle: "Bachata c-today" }),
    );
  });
});

describe("markStudentAttendance — Teacher + attendance:edit_history", () => {
  it("allows present and absent on an earlier day", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    expect((await markClass("past", "present")).success).toBe(true);
    expect((await markClass("past", "absent")).success).toBe(true);
  });

  it("allows editing a class that ended today", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    expect((await markClass("ended", "present")).success).toBe(true);
    h.priorMark = { status: "present" };
    expect((await markClass("ended", "absent")).success).toBe(true);
  });

  it("still denies a future class", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    const res = await markClass("future", "present");
    expect(res.success).toBe(false);
    expectNoSideEffects();
  });
});

describe("markStudentAttendance — permission composition", () => {
  it("attendance:edit_history alone grants neither present nor absent", async () => {
    signIn("custom", ["attendance:edit_history"]);
    for (const key of ["open", "past"] as const) {
      expect((await markClass(key, "present")).success).toBe(false);
      expect((await markClass(key, "absent")).success).toBe(false);
    }
    expectNoSideEffects();
  });

  it("attendance:mark_present alone does not grant historical present", async () => {
    signIn("custom", ["attendance:mark_present"]);
    expect((await markClass("open", "present")).success).toBe(true);
    h.markAttendance.mockClear();
    h.checkInBooking.mockClear();
    h.saveAttendanceToDB.mockClear();
    h.saveBookingToDB.mockClear();
    expect((await markClass("past", "present")).success).toBe(false);
    expect((await markClass("ended", "present")).success).toBe(false);
    expectNoSideEffects();
  });

  it("attendance:mark_absent alone does not grant historical absent", async () => {
    signIn("custom", ["attendance:mark_absent"]);
    expect((await markClass("past", "absent")).success).toBe(false);
    expect((await markClass("ended", "absent")).success).toBe(false);
    expectNoSideEffects();
  });

  it("historical absent needs mark_absent even with edit_history", async () => {
    signIn("custom", ["attendance:mark_present", "attendance:edit_history"]);
    expect((await markClass("past", "present")).success).toBe(true);
    expect((await markClass("past", "absent")).success).toBe(false);
  });
});

// Guille's exact production grant on 2026-10-05 (read-only diagnostic).
const GUILLE: Permission[] = [
  "attendance:mark_absent", "attendance:mark_present", "attendance:view", "bookings:view",
  "checkin:scan", "checkin:view", "dashboard:view", "payments:mark_paid_reception",
  "payments:view_limited", "students:create", "students:manage_affiliations",
  "students:send_magic_link", "students:view_limited", "checkin:manual_checkin",
];
const TEACHER_NO_MANUAL = ROLE_PRESETS.teacher.filter((p) => p !== "checkin:manual_checkin");

const manual = (key: ClassKey, over: Record<string, unknown> = {}) =>
  mark({ bookableClassId: CLASSES[key].id, bookingId: null, studentId: "s-2", attendanceSource: "walk_in", ...over });

describe("manual check-in — checkin:manual_checkin OFF", () => {
  it("a direct call to add a current walk-in is denied", async () => {
    signIn("teacher", TEACHER_NO_MANUAL);
    const res = await manual("open");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/checkin:manual_checkin/);
    expectNoSideEffects();
  });

  it("is denied when attendanceSource is omitted too", async () => {
    signIn("teacher", TEACHER_NO_MANUAL);
    expect((await manual("open", { attendanceSource: undefined })).success).toBe(false);
    expectNoSideEffects();
  });
});

describe("manual check-in — checkin:manual_checkin ON, edit_history OFF (Guille)", () => {
  it("adds a current walk-in as Present without edit_history", async () => {
    signIn("teacher", GUILLE);
    const res = await manual("open");
    expect(res.success).toBe(true);
    expect(h.markAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "s-2", status: "present", source: "walk_in", markedBy: "Session Staff (manual)" }),
    );
  });

  it("adds a walk-in to a class in progress", async () => {
    signIn("teacher", GUILLE);
    expect((await manual("live")).success).toBe(true);
  });

  it("Late is a check-in status and is allowed", async () => {
    signIn("teacher", GUILLE);
    expect((await manual("open", { status: "late" })).success).toBe(true);
  });

  it("drop-in and the student's own subscription are allowed sources", async () => {
    signIn("teacher", GUILLE);
    h.subs.set("sub-s2", { id: "sub-s2", studentId: "s-2", paymentStatus: "paid" });
    expect((await manual("open", { attendanceSource: "drop_in" })).success).toBe(true);
    expect((await manual("open", { attendanceSource: "subscription", directSubscriptionId: "sub-s2" })).success).toBe(true);
  });

  it("cannot record Absent or Excused through manual check-in", async () => {
    signIn("teacher", GUILLE);
    for (const status of ["absent", "excused"]) {
      const res = await manual("open", { status });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Present or Late/);
    }
    expectNoSideEffects();
  });

  it("cannot use the no-charge Admin / Manual source", async () => {
    signIn("teacher", GUILLE);
    const res = await manual("open", { attendanceSource: "admin" });
    expect(res.success).toBe(false);
    expectNoSideEffects();
  });

  it("cannot add a student to a class that ended earlier today", async () => {
    signIn("teacher", GUILLE);
    const res = await manual("ended");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ended/);
    expectNoSideEffects();
  });

  it("cannot create attendance for a past class", async () => {
    signIn("teacher", GUILLE);
    const res = await manual("past");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Backdate/);
    expectNoSideEffects();
  });

  it("cannot edit an ended booked class", async () => {
    signIn("teacher", GUILLE);
    expect((await markClass("ended", "present")).success).toBe(false);
    expect((await markClass("past", "absent")).success).toBe(false);
    expectNoSideEffects();
  });

  it("cannot re-source an existing record", async () => {
    signIn("teacher", GUILLE);
    h.priorMark = { status: "present" };
    h.subs.set("sub-s2", { id: "sub-s2", studentId: "s-2", paymentStatus: "paid" });
    const res = await manual("open", { attendanceSource: "subscription", directSubscriptionId: "sub-s2" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/edit_history/);
    expectNoSideEffects();
  });

  it("cannot backdate without attendance:backdate", async () => {
    signIn("teacher", GUILLE);
    const { backdateAttendanceAction, previewBackdatedAttendanceAction } = await import("../attendance-backdate");
    const input = { studentId: "s-2", bookableClassId: CLASSES.past.id } as never;
    await expect(previewBackdatedAttendanceAction(input)).rejects.toThrow(/REDIRECT:/);
    await expect(backdateAttendanceAction(input)).rejects.toThrow(/REDIRECT:/);
    expectNoSideEffects();
  });

  it("future classes are denied", async () => {
    signIn("teacher", GUILLE);
    expect((await manual("future")).success).toBe(false);
    expectNoSideEffects();
  });
});

describe("manual check-in is not a generic attendance override", () => {
  it("checkin:manual_checkin alone adds a walk-in but cannot mark a booked student", async () => {
    signIn("custom", ["checkin:manual_checkin"]);
    expect((await manual("open")).success).toBe(true);
    h.markAttendance.mockClear();
    h.saveAttendanceToDB.mockClear();
    expect((await markClass("open", "present")).success).toBe(false);
    expect((await markClass("open", "absent")).success).toBe(false);
    expectNoSideEffects();
  });
});

describe("manual add — attendance:edit_history route", () => {
  it("covers ended-today classes, absences and the admin source", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    expect((await manual("ended")).success).toBe(true);
    expect((await manual("open", { status: "absent" })).success).toBe(true);
    expect((await manual("open", { attendanceSource: "admin" })).success).toBe(true);
  });

  it("still does not reach earlier days: edit_history is not a substitute for backdate", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    const res = await manual("past");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Backdate/);
    expectNoSideEffects();
  });

  it("future classes are denied regardless", async () => {
    signIn("admin", ROLE_PRESETS.admin);
    expect((await manual("future")).success).toBe(false);
    expectNoSideEffects();
  });

  it("edit_history without backdate cannot use the backdate flow", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    const { backdateAttendanceAction, previewBackdatedAttendanceAction } = await import("../attendance-backdate");
    const input = { studentId: "s-2", bookableClassId: CLASSES.past.id } as never;
    await expect(previewBackdatedAttendanceAction(input)).rejects.toThrow(/REDIRECT:/);
    await expect(backdateAttendanceAction(input)).rejects.toThrow(/REDIRECT:/);
    expectNoSideEffects();
  });
});

// ── createSubscriptionAction / updateStudentAction ───────────

function assignForm(over: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("studentId", "s-2");
  fd.set("productId", "p-pass");
  fd.set("paymentMethod", "cash");
  fd.set("paymentStatus", "pending");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

async function assign(over: Record<string, string> = {}) {
  const { createSubscriptionAction } = await import("../subscriptions");
  return createSubscriptionAction(assignForm(over));
}

async function editProfile() {
  const { updateStudentAction } = await import("../students");
  const fd = new FormData();
  fd.set("id", "s-2");
  fd.set("fullName", "Edited Name");
  fd.set("email", "s2@example.test");
  try {
    return (await updateStudentAction(fd)).success;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return false;
    throw e;
  }
}

describe("assign pass / membership is its own permission", () => {
  it("assign_subscription ON, students:edit OFF: assignment allowed, profile edit denied", async () => {
    signIn("custom", ["students:view_limited", "students:assign_subscription"]);
    const res = await assign();
    expect(res.success).toBe(true);
    expect(h.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "s-2", productId: "p-pass", assignedBy: "u-1" }),
    );
    expect(await editProfile()).toBe(false);
    expect(h.updateStudent).not.toHaveBeenCalled();
  });

  it("students:edit ON, assign_subscription OFF: profile edit allowed, assignment denied", async () => {
    signIn("custom", ["students:view", "students:edit"]);
    expect(await editProfile()).toBe(true);
    const res = await assign();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permission/i);
    expect(h.createSubscription).not.toHaveBeenCalled();
    expect(h.priceProductForStudent).not.toHaveBeenCalled();
  });

  it("both OFF: neither", async () => {
    signIn("custom", ["students:view"]);
    expect((await assign()).success).toBe(false);
    expect(await editProfile()).toBe(false);
    expect(h.createSubscription).not.toHaveBeenCalled();
    expect(h.updateStudent).not.toHaveBeenCalled();
  });

  it("Super Admin: both", async () => {
    signIn("super_admin", []);
    expect((await assign()).success).toBe(true);
    expect(await editProfile()).toBe(true);
  });

  it("Guille's current grant (no assign_subscription yet) cannot assign", async () => {
    signIn("teacher", GUILLE);
    expect((await assign()).success).toBe(false);
    expect(h.createSubscription).not.toHaveBeenCalled();
  });

  it("Guille with assign_subscription checked can assign, still not edit profiles", async () => {
    signIn("teacher", [...GUILLE, "students:assign_subscription"]);
    expect((await assign()).success).toBe(true);
    expect(await editProfile()).toBe(false);
  });

  it("a manual discount still needs payments:manual_adjustment", async () => {
    signIn("custom", ["students:assign_subscription"]);
    const res = await assign({ manualDiscountEuros: "5", manualDiscountReason: "Loyal student" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manual discount/i);
    expect(h.createSubscription).not.toHaveBeenCalled();
    expect(h.priceProductForStudent).not.toHaveBeenCalled();
  });

  it("assign + manual_adjustment can apply a manual discount", async () => {
    signIn("custom", ["students:assign_subscription", "payments:manual_adjustment"]);
    const res = await assign({ manualDiscountEuros: "5", manualDiscountReason: "Loyal student" });
    expect(res.success).toBe(true);
    expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ manualDiscountCents: 500 }));
  });
});

describe("assigning a pass does not record a payment by itself", () => {
  const ASSIGN_ONLY: Permission[] = ["students:view_limited", "students:assign_subscription"];
  const ASSIGN_RECEPTION: Permission[] = [...ASSIGN_ONLY, "payments:mark_paid_reception"];
  const ASSIGN_ADJUST: Permission[] = [...ASSIGN_ONLY, "payments:manual_adjustment"];
  const ASSIGN_COMP: Permission[] = [...ASSIGN_ONLY, "payments:grant_complimentary"];
  const DISCOUNT = { manualDiscountEuros: "5", manualDiscountReason: "Loyal student" };

  function expectNotCreated() {
    expect(h.createSubscription).not.toHaveBeenCalled();
    expect(h.priceProductForStudent).not.toHaveBeenCalled();
  }

  async function assignWithoutStatus() {
    const fd = assignForm();
    fd.delete("paymentStatus");
    const { createSubscriptionAction } = await import("../subscriptions");
    return createSubscriptionAction(fd);
  }

  describe("assign only", () => {
    it("omitted status creates the pass as Pending", async () => {
      signIn("custom", ASSIGN_ONLY);
      expect((await assignWithoutStatus()).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "pending" }));
    });

    it("explicit Pending is allowed", async () => {
      signIn("custom", ASSIGN_ONLY);
      expect((await assign({ paymentStatus: "pending" })).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "pending" }));
    });

    it("Paid is denied", async () => {
      signIn("custom", ASSIGN_ONLY);
      expect((await assign({ paymentStatus: "paid" })).error).toMatch(/payments:mark_paid_reception/);
      expectNotCreated();
    });

    it("Complimentary and Waived are denied", async () => {
      signIn("custom", ASSIGN_ONLY);
      for (const paymentStatus of ["complimentary", "waived"]) {
        expect((await assign({ paymentStatus })).error).toMatch(/payments:grant_complimentary/);
      }
      expectNotCreated();
    });

    it("Cancelled and Refunded are denied", async () => {
      signIn("custom", ASSIGN_ONLY);
      for (const paymentStatus of ["cancelled", "refunded"]) {
        expect((await assign({ paymentStatus })).error).toMatch(/cannot be created as/);
      }
      expectNotCreated();
    });
  });

  describe("assign + mark_paid_reception", () => {
    it("Paid is allowed", async () => {
      signIn("custom", ASSIGN_RECEPTION);
      expect((await assign({ paymentStatus: "paid" })).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "paid" }));
    });

    it("Complimentary and Waived are still denied", async () => {
      signIn("custom", ASSIGN_RECEPTION);
      for (const paymentStatus of ["complimentary", "waived"]) {
        expect((await assign({ paymentStatus })).error).toMatch(/payments:grant_complimentary/);
      }
      expectNotCreated();
    });

    it("a manual discount still needs manual_adjustment", async () => {
      signIn("custom", ASSIGN_RECEPTION);
      expect((await assign({ paymentStatus: "paid", ...DISCOUNT })).error).toMatch(/manual discount/i);
      expectNotCreated();
    });
  });

  describe("assign + grant_complimentary", () => {
    it("Complimentary is allowed", async () => {
      signIn("custom", ASSIGN_COMP);
      expect((await assign({ paymentStatus: "complimentary" })).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "complimentary" }));
    });

    it("Waived is allowed", async () => {
      signIn("custom", ASSIGN_COMP);
      expect((await assign({ paymentStatus: "waived" })).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "waived" }));
    });

    it("does not allow a manual discount", async () => {
      signIn("custom", ASSIGN_COMP);
      expect((await assign({ paymentStatus: "complimentary", ...DISCOUNT })).error).toMatch(/manual discount/i);
      expect((await assign({ paymentStatus: "pending", ...DISCOUNT })).error).toMatch(/manual discount/i);
      expectNotCreated();
    });

    it("Paid still requires mark_paid_reception", async () => {
      signIn("custom", ASSIGN_COMP);
      expect((await assign({ paymentStatus: "paid" })).error).toMatch(/payments:mark_paid_reception/);
      expectNotCreated();
    });
  });

  describe("assign + manual_adjustment", () => {
    it("Complimentary and Waived are denied", async () => {
      signIn("custom", ASSIGN_ADJUST);
      for (const paymentStatus of ["complimentary", "waived"]) {
        expect((await assign({ paymentStatus })).error).toMatch(/payments:grant_complimentary/);
      }
      expectNotCreated();
    });

    it("a manual discount is allowed", async () => {
      signIn("custom", ASSIGN_ADJUST);
      expect((await assign(DISCOUNT)).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ manualDiscountCents: 500 }));
    });

    it("Paid still requires mark_paid_reception", async () => {
      signIn("custom", ASSIGN_ADJUST);
      expect((await assign({ paymentStatus: "paid" })).error).toMatch(/payments:mark_paid_reception/);
      expectNotCreated();
    });
  });

  it("no permission combination makes Cancelled or Refunded valid at creation", async () => {
    signIn("custom", [
      ...ASSIGN_ONLY, "payments:mark_paid_reception", "payments:manual_adjustment",
      "payments:refund", "finance:mark_paid", "finance:refund",
    ]);
    for (const paymentStatus of ["cancelled", "refunded"]) {
      expect((await assign({ paymentStatus })).error).toMatch(/cannot be created as/);
    }
    signIn("super_admin", []);
    for (const paymentStatus of ["cancelled", "refunded"]) {
      expect((await assign({ paymentStatus })).error).toMatch(/cannot be created as/);
    }
    expectNotCreated();
  });

  it("payment permissions without assign_subscription still cannot assign", async () => {
    signIn("custom", ["students:view_limited", "payments:mark_paid_reception", "payments:manual_adjustment"]);
    expect((await assign({ paymentStatus: "paid" })).success).toBe(false);
    expect((await assign({ paymentStatus: "complimentary" })).success).toBe(false);
    expectNotCreated();
  });

  it("Guille with assign_subscription checked: Pending and Paid, not Complimentary / Waived", async () => {
    signIn("teacher", [...GUILLE, "students:assign_subscription"]);
    expect((await assign({ paymentStatus: "pending" })).success).toBe(true);
    expect((await assign({ paymentStatus: "paid" })).success).toBe(true);
    h.createSubscription.mockClear();
    h.priceProductForStudent.mockClear();
    expect((await assign({ paymentStatus: "complimentary" })).success).toBe(false);
    expect((await assign({ paymentStatus: "waived" })).success).toBe(false);
    expectNotCreated();
  });

  it("Super Admin can create Pending, Paid, Complimentary and Waived", async () => {
    signIn("super_admin", []);
    for (const paymentStatus of ["pending", "paid", "complimentary", "waived"]) {
      expect((await assign({ paymentStatus })).success).toBe(true);
    }
  });

  it("Anisia's grant after 00081 keeps Pending, Paid, Complimentary and Waived", async () => {
    const anisia: Permission[] = [...ROLE_PRESETS.admin, "students:send_magic_link"];
    expect(anisia).not.toContain("payments:manual_adjustment");
    signIn("admin", anisia);
    for (const paymentStatus of ["pending", "paid", "complimentary", "waived"]) {
      expect((await assign({ paymentStatus })).success).toBe(true);
    }
    h.createSubscription.mockClear();
    h.priceProductForStudent.mockClear();
    expect((await assign(DISCOUNT)).error).toMatch(/manual discount/i);
    expectNotCreated();
  });
});

describe("assigning a pass — payment method matches payment status", () => {
  const ALL: Permission[] = [
    "students:view_limited", "students:assign_subscription",
    "payments:mark_paid_reception", "payments:grant_complimentary",
  ];

  it("Paid with the Complimentary method is denied", async () => {
    signIn("custom", ALL);
    const res = await assign({ paymentStatus: "paid", paymentMethod: "complimentary" });
    expect(res.error).toMatch(/cannot use the Complimentary payment method/);
    expect(h.createSubscription).not.toHaveBeenCalled();
    expect(h.priceProductForStudent).not.toHaveBeenCalled();
  });

  it("Pending with the Complimentary method is denied", async () => {
    signIn("custom", ALL);
    const res = await assign({ paymentStatus: "pending", paymentMethod: "complimentary" });
    expect(res.error).toMatch(/cannot use the Complimentary payment method/);
    expect(h.createSubscription).not.toHaveBeenCalled();
    expect(h.priceProductForStudent).not.toHaveBeenCalled();
  });

  it("Complimentary with a normal method is stored with the Complimentary method", async () => {
    signIn("custom", ALL);
    expect((await assign({ paymentStatus: "complimentary", paymentMethod: "cash" })).success).toBe(true);
    expect(h.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "complimentary", paymentMethod: "complimentary" }),
    );
  });

  it("Waived is stored with the Complimentary method", async () => {
    signIn("custom", ALL);
    expect((await assign({ paymentStatus: "waived", paymentMethod: "revolut" })).success).toBe(true);
    expect(h.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "waived", paymentMethod: "complimentary" }),
    );
  });

  it("Paid and Pending keep the method chosen", async () => {
    signIn("custom", ALL);
    for (const [paymentStatus, paymentMethod] of [["paid", "revolut"], ["pending", "cash"]] as const) {
      h.createSubscription.mockClear();
      expect((await assign({ paymentStatus, paymentMethod })).success).toBe(true);
      expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus, paymentMethod }));
    }
  });
});

describe("markStudentAttendance — one key per status", () => {
  it("Teacher defaults can mark present", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    const res = await mark({ status: "present" });
    expect(res.success).toBe(true);
  });

  it("Teacher defaults can mark absent and undo an absent mark", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    expect((await mark({ status: "absent" })).success).toBe(true);
    h.priorMark = { status: "absent" };
    expect((await mark({ status: "present" })).success).toBe(true);
  });

  it("Teacher with attendance:mark_absent unchecked cannot mark absent", async () => {
    signIn("teacher", ROLE_PRESETS.teacher.filter((p) => p !== "attendance:mark_absent"));
    const res = await mark({ status: "absent" });
    expect(res.success).toBe(false);
    expect(h.markAttendance).not.toHaveBeenCalled();
  });

  it("Front Desk defaults can mark present", async () => {
    signIn("front_desk", ROLE_PRESETS.front_desk);
    expect((await mark({ status: "present" })).success).toBe(true);
  });

  it("Front Desk defaults cannot mark absent (no-show fee)", async () => {
    signIn("front_desk", ROLE_PRESETS.front_desk);
    const res = await mark({ status: "absent" });
    expect(res.success).toBe(false);
    expect(h.markAttendance).not.toHaveBeenCalled();
  });

  it("Front Desk defaults cannot turn an absent mark into present (voids the fee)", async () => {
    signIn("front_desk", ROLE_PRESETS.front_desk);
    h.priorMark = { status: "absent" };
    const res = await mark({ status: "present" });
    expect(res.success).toBe(false);
    expect(h.markAttendance).not.toHaveBeenCalled();
  });

  it("attendance:mark_absent alone cannot mark present", async () => {
    signIn("custom", ["attendance:mark_absent"]);
    const res = await mark({ status: "present" });
    expect(res.success).toBe(false);
  });

  it("Admin defaults can mark absent and undo it", async () => {
    signIn("admin", ROLE_PRESETS.admin);
    expect((await mark({ status: "absent" })).success).toBe(true);
    h.priorMark = { status: "absent" };
    expect((await mark({ status: "present" })).success).toBe(true);
  });

  it("markedBy and studentName come from the server, not the caller", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    await mark({ status: "present" });
    expect(h.markAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ markedBy: "Session Staff", studentName: "Real Name" }),
    );
  });

  it("rejects a booking id that belongs to another student", async () => {
    signIn("admin", ROLE_PRESETS.admin);
    h.bookings.push({ id: "b-9", studentId: "s-OTHER", bookableClassId: "c-1", status: "confirmed", subscriptionId: null });
    const res = await mark({ bookingId: "b-9" });
    expect(res.success).toBe(false);
    expect(h.markAttendance).not.toHaveBeenCalled();
  });

  it("rejects a subscription id that belongs to another student", async () => {
    signIn("admin", ROLE_PRESETS.admin);
    h.subs.set("sub-x", { id: "sub-x", studentId: "s-OTHER" });
    const res = await mark({ directSubscriptionId: "sub-x", attendanceSource: "subscription" });
    expect(res.success).toBe(false);
    expect(h.markAttendance).not.toHaveBeenCalled();
  });

  it("unauthenticated callers are redirected before any data loads", async () => {
    await expect(mark()).rejects.toThrow(/REDIRECT:/);
  });
});

describe("a pass whose payment is not confirmed cannot be used to check in", () => {
  const NOT_CONFIRMED = "Payment must be confirmed before check-in.";
  const setPayment = (paymentStatus: string) => h.subs.set("sub-att", { ...h.subs.get("sub-att"), paymentStatus });

  it("Attendance page: Present / Late for a booked student on a pending pass is refused with no writes", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    setPayment("pending");
    for (const status of ["present", "late"]) {
      const res = await markClass("open", "present", { status });
      expect(res.error).toBe(NOT_CONFIRMED);
    }
    expectNoSideEffects();
  });

  it("Attendance page: Cancelled and Refunded passes are refused too", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    for (const paymentStatus of ["cancelled", "refunded"]) {
      setPayment(paymentStatus);
      expect((await markClass("open", "present")).error).toBe(NOT_CONFIRMED);
    }
    expectNoSideEffects();
  });

  it("Attendance page: Paid, Complimentary and Waived passes are accepted", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    for (const paymentStatus of ["paid", "complimentary", "waived"]) {
      setPayment(paymentStatus);
      expect((await markClass("open", "present")).success).toBe(true);
    }
  });

  it("Attendance page: Absent is not a check-in and is still allowed on a pending pass", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    setPayment("pending");
    expect((await markClass("open", "absent")).success).toBe(true);
  });

  it("Attendance page: an ended-class correction (edit_history) is not blocked", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    setPayment("pending");
    expect((await markClass("ended", "present")).success).toBe(true);
  });

  it("Add student: the student's own pending pass is refused with no writes", async () => {
    signIn("teacher", GUILLE);
    h.subs.set("sub-s2", { id: "sub-s2", studentId: "s-2", paymentStatus: "pending" });
    const res = await manual("open", { attendanceSource: "subscription", directSubscriptionId: "sub-s2" });
    expect(res.error).toBe(NOT_CONFIRMED);
    expectNoSideEffects();
  });

  it("token check-in: a booking on a pending pass is refused with no writes", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    setPayment("pending");
    h.bookings[0].checkInToken = "a".repeat(32);
    h.bookings[0].bookableClassId = CLASSES.open.id;
    const { validateTokenCheckInAction } = await import("../checkin");
    const res = await validateTokenCheckInAction("a".repeat(32));
    expect(res.error).toBe(NOT_CONFIRMED);
    expectNoSideEffects();
  });

  it("admin booking check-in (Bookings page): a pending pass is refused with no writes; paid checks in", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    setPayment("pending");
    const { adminCheckInBookingAction } = await import("../bookings-admin");
    expect((await adminCheckInBookingAction(`b-${CLASSES.open.id}`)).error).toBe(NOT_CONFIRMED);
    expectNoSideEffects();
    setPayment("paid");
    h.checkInBooking.mockReturnValue({ type: "checked_in" });
    expect((await adminCheckInBookingAction(`b-${CLASSES.open.id}`)).success).toBe(true);
    expect(h.checkInBooking).toHaveBeenCalledWith(`b-${CLASSES.open.id}`);
  });

  it("student self check-in: refused on a pending pass, allowed once paid; the eligibility shown agrees", async () => {
    signIn(null);
    h.user = { ...h.user!, id: "s-1", role: "student" };
    setPayment("pending");
    const { studentSelfCheckInAction, checkSelfCheckInEligibility } = await import("../checkin");
    const bookingId = `b-${CLASSES.live.id}`;
    expect(await checkSelfCheckInEligibility(bookingId)).toEqual({ eligible: false, reason: NOT_CONFIRMED });
    expect((await studentSelfCheckInAction(bookingId)).error).toBe(NOT_CONFIRMED);
    expectNoSideEffects();
    setPayment("paid");
    h.checkInBooking.mockReturnValue({ type: "checked_in" });
    expect((await checkSelfCheckInEligibility(bookingId)).eligible).toBe(true);
    expect((await studentSelfCheckInAction(bookingId)).success).toBe(true);
  });

  it("token check-in: a paid booking checks in", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    h.checkInBooking.mockReturnValue({ type: "checked_in" });
    const booking = h.bookings.find((b) => b.bookableClassId === CLASSES.open.id)!;
    booking.checkInToken = "b".repeat(32);
    const { validateTokenCheckInAction } = await import("../checkin");
    expect((await validateTokenCheckInAction("b".repeat(32))).success).toBe(true);
    expect(h.checkInBooking).toHaveBeenCalledWith(booking.id);
  });
});
