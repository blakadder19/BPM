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
  bookings: [] as { id: string; studentId: string; bookableClassId: string; status: string; subscriptionId: string | null }[],
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
  getProductRepo: () => ({}),
  getTermRepo: () => ({}),
}));
vi.mock("@/lib/services/subscription-service", () => ({
  createSubscription: vi.fn(),
  updateSubscription: h.updateSubscription,
}));
vi.mock("@/lib/services/subscription-snapshot-service", () => ({ buildSnapshotFromProduct: vi.fn() }));
vi.mock("@/lib/services/pricing-service", () => ({
  priceProductForStudent: vi.fn(),
  buildAuditDiscountMetadata: vi.fn(),
  releaseDiscountClaim: vi.fn(),
  attachClaimRelations: vi.fn(),
  resolveVatFor: vi.fn(),
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
vi.mock("@/lib/services/settings-store", () => ({ getSettings: () => ({ refundCreditOnAbsent: false }) }));
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
    h.savePenaltyToDB, h.updatePenaltyInDB,
  ]) fn.mockReset();
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
  h.subs.set("sub-att", { id: "sub-att", studentId: "s-1", classesUsed: 1, classesPerTerm: 8, remainingCredits: 7 });
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

describe("markStudentAttendance — manual add (no booking)", () => {
  const manual = (key: ClassKey, over: Record<string, unknown> = {}) =>
    mark({ bookableClassId: CLASSES[key].id, bookingId: null, studentId: "s-2", attendanceSource: "walk_in", ...over });

  it("is denied without attendance:edit_history", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    const res = await manual("open");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/edit_history/);
    expectNoSideEffects();
  });

  it("is denied without edit_history even when attendanceSource is omitted", async () => {
    signIn("teacher", ROLE_PRESETS.teacher);
    const res = await manual("open", { attendanceSource: undefined });
    expect(res.success).toBe(false);
    expectNoSideEffects();
  });

  it("is allowed with attendance:edit_history for today's class", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    expect((await manual("open")).success).toBe(true);
    expect((await manual("ended")).success).toBe(true);
  });

  it("does not reach earlier days: edit_history is not a substitute for backdate", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    const res = await manual("past");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Backdate/);
    expectNoSideEffects();
  });

  it("is denied for a future class", async () => {
    signIn("admin", ROLE_PRESETS.admin);
    const res = await manual("future");
    expect(res.success).toBe(false);
    expectNoSideEffects();
  });
});

describe("backdated attendance still requires attendance:backdate", () => {
  it("edit_history without backdate is redirected before any work", async () => {
    signIn("teacher", TEACHER_WITH_HISTORY);
    const { backdateAttendanceAction, previewBackdatedAttendanceAction } = await import("../attendance-backdate");
    const input = { studentId: "s-2", bookableClassId: CLASSES.past.id } as never;
    await expect(previewBackdatedAttendanceAction(input)).rejects.toThrow(/REDIRECT:/);
    await expect(backdateAttendanceAction(input)).rejects.toThrow(/REDIRECT:/);
    expectNoSideEffects();
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
