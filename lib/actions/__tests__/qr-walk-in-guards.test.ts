/**
 * QR check-in paths that use or sell a pass:
 *   - qrCheckInBookingAction: the booking is checkable now (class today, not
 *     cancelled, not ended, inside the staff window) and its pass is the
 *     booked student's, covers the class under the real entitlement rules
 *     (counting this booking's own credit, which was taken at booking) and
 *     is paid for. Check-in takes no further credit.
 *   - qrWalkInCheckInAction / qrMarkPaidAndWalkInAction: the pass must be
 *     the student's, valid for the class and paid for (or pending, when the
 *     caller is collecting payment).
 *   - qrMarkPaidAndCheckInAction: everything above, before the payment is
 *     recorded. A booking without a pass gets the paid pass attached and
 *     exactly one credit taken from it.
 *   - qrSellDropInAndCheckInAction: nothing is sold unless the drop-in
 *     would be accepted for the class.
 * Every rejection leaves zero writes. Uses the real staff-access resolver,
 * entitlement rules, access-rule builder and check-in eligibility rules.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";
import type { Permission, StaffRoleKey } from "@/lib/domain/permissions";

const h = vi.hoisted(() => ({
  user: null as AuthUser | null,
  row: null as StaffMember | null,
  subs: new Map<string, Record<string, unknown>>(),
  bookings: [] as Record<string, unknown>[],
  instances: [] as Record<string, unknown>[],
  products: [] as Record<string, unknown>[],
  markAttendance: vi.fn(),
  checkInBooking: vi.fn(),
  updateSubscription: vi.fn(),
  createSubscription: vi.fn(),
  priceProductForStudent: vi.fn(),
  saveBookingToDB: vi.fn(),
  saveAttendanceToDB: vi.fn(),
  logFinanceEvent: vi.fn(),
  dismissNotifications: vi.fn(),
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
  getSubscriptionRepo: () => ({
    getById: async (id: string) => h.subs.get(id) ?? null,
    getAll: async () => [...h.subs.values()],
  }),
  getStudentRepo: () => ({
    getAll: async () => [
      { id: "s-1", fullName: "Student One" },
      { id: "s-2", fullName: "Student Two", qrToken: STUDENT_TWO_QR },
    ],
  }),
  getProductRepo: () => ({ getAll: async () => h.products }),
  getTermRepo: () => ({ getAll: async () => [] }),
  getSpecialEventRepo: () => ({}),
}));
vi.mock("@/lib/services/subscription-service", () => ({
  createSubscription: h.createSubscription,
  updateSubscription: h.updateSubscription,
}));
vi.mock("@/lib/services/subscription-snapshot-service", () => ({ buildSnapshotFromProduct: vi.fn(async () => null) }));
vi.mock("@/lib/services/pricing-service", () => ({
  priceProductForStudent: h.priceProductForStudent,
  buildAuditDiscountMetadata: vi.fn(),
  releaseDiscountClaim: vi.fn(),
  attachClaimRelations: vi.fn(),
}));
vi.mock("@/lib/supabase/hydrate-operational", () => ({
  ensureOperationalDataHydrated: vi.fn(async () => {}),
  invalidateHydration: vi.fn(),
}));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: h.logFinanceEvent }));
vi.mock("@/lib/communications/notification-store", () => ({
  dismissNotificationsForSubscription: h.dismissNotifications,
}));
vi.mock("@/lib/services/booking-store", () => ({
  getBookingService: () => ({ bookings: h.bookings, getClass: () => undefined, checkInBooking: h.checkInBooking }),
}));
vi.mock("@/lib/services/attendance-store", () => ({
  getAttendanceService: () => ({ markAttendance: h.markAttendance, getRecord: () => null }),
}));
vi.mock("@/lib/supabase/operational-persistence", () => ({
  saveBookingToDB: h.saveBookingToDB,
  saveAttendanceToDB: h.saveAttendanceToDB,
}));
vi.mock("@/lib/utils/is-real-user", () => ({ isRealUser: () => true }));
vi.mock("@/lib/services/schedule-store", () => ({ getInstances: () => h.instances }));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@/lib/services/settings-store", () => ({
  getSettings: () => ({ attendanceClosureMinutes: 60, qrCheckInEnabled: true, selfCheckInEnabled: true, selfCheckInOpensMinutesBefore: 30 }),
}));

const STUDENT_TWO_QR = `bpm-${"ab".repeat(16)}`;
const PAYMENT_NOT_CONFIRMED = "Payment must be confirmed before check-in.";

// Clock: 2026-10-01 17:00 UTC = 18:00 Europe/Dublin (IST). Attendance
// closes 60 minutes after a class starts.
const NOW = new Date("2026-10-01T17:00:00Z");
const bachata = { classType: "class", styleId: "style-bachata", styleName: "Bachata", level: "1" };
const CLASSES = {
  open: { id: "c-open", date: "2026-10-01", startTime: "19:00", endTime: "20:00", ...bachata },
  live: { id: "c-live", date: "2026-10-01", startTime: "17:30", endTime: "18:30", ...bachata },
  closed: { id: "c-closed", date: "2026-10-01", startTime: "16:30", endTime: "18:30", ...bachata },
  ended: { id: "c-ended", date: "2026-10-01", startTime: "16:00", endTime: "17:00", ...bachata },
  cancelled: { id: "c-cancelled", date: "2026-10-01", startTime: "19:00", endTime: "20:00", status: "cancelled", ...bachata },
  past: { id: "c-past", date: "2026-09-30", startTime: "19:00", endTime: "20:00", ...bachata },
  salsa: { id: "c-salsa", date: "2026-10-01", startTime: "19:00", endTime: "20:00", classType: "class", styleId: "style-salsa", styleName: "Salsa", level: "1" },
  level3: { id: "c-level3", date: "2026-10-01", startTime: "19:00", endTime: "20:00", ...bachata, level: "3" },
  social: { id: "c-social", date: "2026-10-01", startTime: "21:00", endTime: "23:00", classType: "social", styleId: null, styleName: null, level: null },
} as const;

const PRODUCTS = [
  { id: "t-bachata", name: "Test Bachata Pass", productType: "pass", allowedStyleIds: ["style-bachata"], allowedLevels: ["1", "2"], allowedClassTypes: ["class"] },
  { id: "t-salsa", name: "Test Salsa Pass", productType: "pass", allowedStyleIds: ["style-salsa"], allowedLevels: null, allowedClassTypes: ["class"] },
  { id: "t-drop", name: "Test Desk Drop-in", productType: "drop_in", isActive: true, priceCents: 1500, totalCredits: 1, allowedStyleIds: null, allowedLevels: null, allowedClassTypes: ["class"] },
];

function pass(id: string, over: Record<string, unknown> = {}) {
  const s = {
    id,
    studentId: "s-2",
    productId: "t-bachata",
    productName: "Test Bachata Pass",
    productType: "pass",
    status: "active",
    validFrom: "2026-09-01",
    validUntil: "2026-12-31",
    totalCredits: 4,
    remainingCredits: 3,
    classesUsed: 0,
    classesPerTerm: null,
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    productSnapshot: null,
    paymentStatus: "paid",
    ...over,
  };
  h.subs.set(id, s);
  return s;
}

const pending = (id: string) => pass(id, { ...h.subs.get(id), paymentStatus: "pending" });

function book(id: string, classId: string, over: Record<string, unknown> = {}) {
  h.bookings.push({
    id,
    studentId: "s-2",
    studentName: "Student Two",
    bookableClassId: classId,
    status: "confirmed",
    source: "subscription",
    subscriptionId: "sub-own",
    subscriptionName: "Test Bachata Pass",
    danceRole: null,
    ...over,
  });
}

const DESK: Permission[] = ["checkin:scan", "checkin:manual_checkin", "payments:mark_paid_reception"];

function signIn(roleKey: StaffRoleKey | null, permissions: readonly Permission[]) {
  h.user = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Session Staff",
    role: "teacher",
    avatarUrl: null,
    academyId: "a-1",
    emailConfirmed: true,
  };
  h.row = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Session Staff",
    legacyRole: "teacher",
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.subs.clear();
  h.bookings.length = 0;
  h.instances = Object.values(CLASSES).map((c) => ({ title: `Class ${c.id}`, ...c }));
  h.products = PRODUCTS.map((p) => ({ ...p }));
  pass("sub-own");
  pass("sub-other", { studentId: "s-1" });
  pass("sub-salsa", { productId: "t-salsa", productName: "Test Salsa Pass" });
  pass("sub-inactive", { status: "expired" });
  pass("sub-exhausted", { remainingCredits: 0 });
  pass("sub-not-started", { validFrom: "2026-10-10" });
  pass("sub-lapsed", { validUntil: "2026-09-30" });
  // Live product covers Bachata; the frozen snapshot only covered Salsa.
  pass("sub-snapshot-salsa", {
    productSnapshot: {
      snapshotAt: "2026-09-01T10:00:00Z",
      allowedStyleIds: ["style-salsa"],
      allowedStyleNames: ["Salsa"],
      allowedLevels: null,
      benefits: null,
      termBound: false,
      recurring: false,
      spanTerms: null,
      perks: null,
      allowedClassTypes: ["class"],
      styleAccessMode: "fixed",
      styleAccessPickCount: null,
      styleAccessStyleIds: ["style-salsa"],
      styleAccessStyleNames: ["Salsa"],
    },
  });
  for (const fn of [h.markAttendance, h.checkInBooking, h.updateSubscription, h.createSubscription, h.priceProductForStudent, h.saveBookingToDB, h.saveAttendanceToDB, h.logFinanceEvent, h.dismissNotifications]) fn.mockReset();
  h.checkInBooking.mockReturnValue({ type: "checked_in" });
  h.updateSubscription.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
    const s = h.subs.get(id);
    if (s) h.subs.set(id, { ...s, ...patch });
    return { success: true };
  });
  h.createSubscription.mockImplementation(async (input: Record<string, unknown>) => {
    h.subs.set("sub-sold", { id: "sub-sold", ...input });
    return { success: true, subscriptionId: "sub-sold" };
  });
  h.priceProductForStudent.mockResolvedValue({
    basePriceCents: 1500,
    totalDiscountCents: 0,
    appliedDiscounts: [],
    snapshot: null,
    claim: null,
    vat: { vatApplied: false, totalIncVatCents: 1500 },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Snapshot of everything a rejected action must leave untouched. */
function state() {
  return JSON.stringify({ subs: [...h.subs.entries()], bookings: h.bookings });
}

/**
 * No payment, finance audit, notification, booking, attendance or credit
 * write, and no in-memory change to passes or bookings since `before`.
 */
function expectNothingWritten(before: string) {
  expect(h.markAttendance).not.toHaveBeenCalled();
  expect(h.checkInBooking).not.toHaveBeenCalled();
  expect(h.updateSubscription).not.toHaveBeenCalled();
  expect(h.createSubscription).not.toHaveBeenCalled();
  expect(h.priceProductForStudent).not.toHaveBeenCalled();
  expect(h.saveBookingToDB).not.toHaveBeenCalled();
  expect(h.saveAttendanceToDB).not.toHaveBeenCalled();
  expect(h.logFinanceEvent).not.toHaveBeenCalled();
  expect(h.dismissNotifications).not.toHaveBeenCalled();
  expect(state()).toBe(before);
}

async function checkIn(bookingId: string) {
  const { qrCheckInBookingAction } = await import("../qr-checkin");
  return qrCheckInBookingAction(bookingId);
}

async function walkIn(classId: string, subscriptionId: string) {
  const { qrWalkInCheckInAction } = await import("../qr-checkin");
  return qrWalkInCheckInAction("s-2", classId, subscriptionId);
}

async function payAndWalkIn(classId: string, subscriptionId: string) {
  const { qrMarkPaidAndWalkInAction } = await import("../qr-checkin");
  return qrMarkPaidAndWalkInAction("s-2", classId, subscriptionId, "cash");
}

async function payAndCheckIn(bookingId: string, subscriptionId: string) {
  const { qrMarkPaidAndCheckInAction } = await import("../qr-checkin");
  return qrMarkPaidAndCheckInAction(bookingId, subscriptionId, "cash");
}

async function sellDropIn(classId: string) {
  const { qrSellDropInAndCheckInAction } = await import("../qr-checkin");
  return qrSellDropInAndCheckInAction("s-2", classId);
}

// Passes that belong to s-2 but cannot be used for the open Bachata level-1 class.
const UNUSABLE_FOR_OPEN: [string, string][] = [
  ["wrong style (Salsa pass)", "sub-salsa"],
  ["inactive status", "sub-inactive"],
  ["no credits left", "sub-exhausted"],
  ["not started yet", "sub-not-started"],
  ["validity ended", "sub-lapsed"],
  ["snapshot narrower than the live product", "sub-snapshot-salsa"],
];

describe("qrCheckInBookingAction", () => {
  it("checks in a booking whose paid pass covers the class, taking no further credit", async () => {
    signIn("custom", DESK);
    book("b-1", CLASSES.open.id);
    const res = await checkIn("b-1");
    expect(res.success).toBe(true);
    expect(h.checkInBooking).toHaveBeenCalledWith("b-1");
    expect(h.markAttendance).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "b-1", status: "present" }));
    expect(h.updateSubscription).not.toHaveBeenCalled();
    expect(h.subs.get("sub-own")).toMatchObject({ remainingCredits: 3 });
  });

  it("counts the booking's own credit: a one-class drop-in at 0 after booking still checks in", async () => {
    signIn("custom", DESK);
    pass("sub-drop", { productType: "drop_in", productId: "t-drop", productName: "Test Desk Drop-in", totalCredits: 1, remainingCredits: 0 });
    book("b-1", CLASSES.open.id, { subscriptionId: "sub-drop" });
    expect((await checkIn("b-1")).success).toBe(true);
    expect(h.updateSubscription).not.toHaveBeenCalled();
  });

  it("counts the booking's own class on a membership", async () => {
    signIn("custom", DESK);
    pass("sub-member", { productType: "membership", classesPerTerm: 8, classesUsed: 8, remainingCredits: null, totalCredits: null, productId: "t-bachata" });
    book("b-1", CLASSES.open.id, { subscriptionId: "sub-member" });
    expect((await checkIn("b-1")).success).toBe(true);
    expect(h.updateSubscription).not.toHaveBeenCalled();
  });

  it("Complimentary and Waived passes are payment-satisfied", async () => {
    signIn("custom", DESK);
    for (const paymentStatus of ["complimentary", "waived"]) {
      h.bookings.length = 0;
      pass("sub-own", { paymentStatus });
      book("b-1", CLASSES.open.id);
      expect((await checkIn("b-1")).success).toBe(true);
    }
  });

  it("a booking without a pass on a class that needs none checks in", async () => {
    signIn("custom", DESK);
    book("b-1", CLASSES.social.id, { subscriptionId: null, subscriptionName: null });
    expect((await checkIn("b-1")).success).toBe(true);
    expect(h.updateSubscription).not.toHaveBeenCalled();
  });

  const DENIED: [string, () => void, RegExp][] = [
    ["past class", () => book("b-1", CLASSES.past.id), /not today/],
    ["class that ended today", () => book("b-1", CLASSES.ended.id), /ended/],
    ["cancelled class", () => book("b-1", CLASSES.cancelled.id), /cancelled/],
    ["attendance window closed", () => book("b-1", CLASSES.closed.id), /window has closed/],
    ["cancelled booking", () => book("b-1", CLASSES.open.id, { status: "cancelled" }), /cannot be checked in/],
    ["late-cancelled booking", () => book("b-1", CLASSES.open.id, { status: "late_cancelled" }), /cannot be checked in/],
    ["missed booking", () => book("b-1", CLASSES.open.id, { status: "missed" }), /cannot be checked in/],
    ["already checked in", () => book("b-1", CLASSES.open.id, { status: "checked_in" }), /Already checked in/],
    ["another student's pass", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-other" }), /does not belong/],
    ["a pass that no longer exists", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-gone" }), /does not belong/],
    ["wrong style", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-salsa" }), /is not valid for/],
    ["wrong level", () => book("b-1", CLASSES.level3.id), /is not valid for/],
    ["pass not started", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-not-started" }), /is not valid for/],
    ["pass validity ended", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-lapsed" }), /is not valid for/],
    ["inactive pass", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-inactive" }), /is not valid for/],
    ["snapshot narrower than the live product", () => book("b-1", CLASSES.open.id, { subscriptionId: "sub-snapshot-salsa" }), /is not valid for/],
    [
      "exhausted even counting this booking's class",
      () => {
        pass("sub-over", { productType: "membership", classesPerTerm: 8, classesUsed: 9, remainingCredits: null, totalCredits: null });
        book("b-1", CLASSES.open.id, { subscriptionId: "sub-over" });
      },
      /is not valid for/,
    ],
    ["pending payment", () => { pending("sub-own"); book("b-1", CLASSES.open.id); }, new RegExp(PAYMENT_NOT_CONFIRMED)],
    ["cancelled payment", () => { pass("sub-own", { paymentStatus: "cancelled" }); book("b-1", CLASSES.open.id); }, new RegExp(PAYMENT_NOT_CONFIRMED)],
    ["refunded payment", () => { pass("sub-own", { paymentStatus: "refunded" }); book("b-1", CLASSES.open.id); }, new RegExp(PAYMENT_NOT_CONFIRMED)],
    ["no pass on a class that needs one", () => book("b-1", CLASSES.open.id, { subscriptionId: null }), /no pass attached/],
  ];
  for (const [why, setup, error] of DENIED) {
    it(`denies with zero writes: ${why}`, async () => {
      signIn("custom", DESK);
      setup();
      const before = state();
      const res = await checkIn("b-1");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(error);
      expectNothingWritten(before);
    });
  }

  it("denies an unknown booking", async () => {
    signIn("custom", DESK);
    const before = state();
    expect((await checkIn("b-missing")).error).toBe("Booking not found");
    expectNothingWritten(before);
  });

  it("needs checkin:manual_checkin", async () => {
    signIn("custom", ["checkin:scan", "payments:mark_paid_reception"]);
    book("b-1", CLASSES.open.id);
    const before = state();
    expect((await checkIn("b-1")).success).toBe(false);
    expectNothingWritten(before);
  });
});

describe("qrWalkInCheckInAction", () => {
  it("checks a student in with their own paid pass that covers the class", async () => {
    signIn("custom", DESK);
    const res = await walkIn(CLASSES.open.id, "sub-own");
    expect(res.success).toBe(true);
    expect(h.markAttendance).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s-2", bookableClassId: CLASSES.open.id }));
    expect(h.updateSubscription).toHaveBeenCalledWith("sub-own", expect.objectContaining({ remainingCredits: 2 }));
  });

  it("accepts Complimentary and Waived passes", async () => {
    signIn("custom", DESK);
    for (const paymentStatus of ["complimentary", "waived"]) {
      h.bookings.length = 0;
      pass("sub-own", { paymentStatus });
      expect((await walkIn(CLASSES.open.id, "sub-own")).success).toBe(true);
    }
  });

  it("rejects a pending pass", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    const before = state();
    expect((await walkIn(CLASSES.open.id, "sub-own")).error).toBe(PAYMENT_NOT_CONFIRMED);
    expectNothingWritten(before);
  });

  it("rejects another student's pass", async () => {
    signIn("custom", DESK);
    const before = state();
    const res = await walkIn(CLASSES.open.id, "sub-other");
    expect(res.error).toMatch(/does not belong/);
    expectNothingWritten(before);
  });

  it("rejects an unknown or empty pass id", async () => {
    signIn("custom", DESK);
    const before = state();
    expect((await walkIn(CLASSES.open.id, "sub-missing")).success).toBe(false);
    expect((await walkIn(CLASSES.open.id, "")).success).toBe(false);
    expectNothingWritten(before);
  });

  for (const [why, subId] of UNUSABLE_FOR_OPEN) {
    it(`rejects the student's own pass when it is not valid for the class: ${why}`, async () => {
      signIn("custom", DESK);
      const before = state();
      const res = await walkIn(CLASSES.open.id, subId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/is not valid for/);
      expectNothingWritten(before);
    });
  }

  it("rejects a level the pass does not cover, and a social with a class pass", async () => {
    signIn("custom", DESK);
    const before = state();
    expect((await walkIn(CLASSES.level3.id, "sub-own")).error).toMatch(/is not valid for/);
    expect((await walkIn(CLASSES.social.id, "sub-own")).error).toMatch(/is not valid for/);
    expectNothingWritten(before);
  });

  it("rejects a class that ended, a cancelled class and an earlier day", async () => {
    signIn("custom", DESK);
    const before = state();
    expect((await walkIn(CLASSES.ended.id, "sub-own")).error).toMatch(/ended/);
    expect((await walkIn(CLASSES.cancelled.id, "sub-own")).error).toMatch(/cancelled/);
    expect((await walkIn(CLASSES.past.id, "sub-own")).error).toMatch(/not today/);
    expectNothingWritten(before);
  });

  it("needs checkin:manual_checkin", async () => {
    signIn("custom", ["checkin:scan", "payments:mark_paid_reception"]);
    const before = state();
    expect((await walkIn(CLASSES.open.id, "sub-own")).success).toBe(false);
    expectNothingWritten(before);
  });
});

describe("qrMarkPaidAndWalkInAction", () => {
  it("marks the student's own pending pass paid, then checks them in using it", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    expect((await payAndWalkIn(CLASSES.open.id, "sub-own")).success).toBe(true);
    expect(h.updateSubscription).toHaveBeenNthCalledWith(1, "sub-own", expect.objectContaining({ paymentStatus: "paid" }));
    expect(h.updateSubscription).toHaveBeenNthCalledWith(2, "sub-own", { remainingCredits: 2 });
    expect(h.markAttendance).toHaveBeenCalled();
  });

  it("does not re-record payment on a pass that is already paid", async () => {
    signIn("custom", DESK);
    const before = state();
    expect((await payAndWalkIn(CLASSES.open.id, "sub-own")).error).toBe("This pass is not awaiting payment.");
    expectNothingWritten(before);
  });

  it("does not mark another student's pass paid", async () => {
    signIn("custom", DESK);
    pending("sub-other");
    const before = state();
    expect((await payAndWalkIn(CLASSES.open.id, "sub-other")).success).toBe(false);
    expectNothingWritten(before);
  });

  for (const [why, subId] of UNUSABLE_FOR_OPEN) {
    it(`does not mark a pass paid that cannot be used for the class: ${why}`, async () => {
      signIn("custom", DESK);
      pending(subId);
      const before = state();
      expect((await payAndWalkIn(CLASSES.open.id, subId)).success).toBe(false);
      expectNothingWritten(before);
    });
  }

  it("does not mark a pass paid when the class has ended", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    const before = state();
    expect((await payAndWalkIn(CLASSES.ended.id, "sub-own")).success).toBe(false);
    expectNothingWritten(before);
  });

  it("does not mark a pass paid when the user cannot check the student in", async () => {
    signIn("custom", ["checkin:scan", "payments:mark_paid_reception"]);
    pending("sub-own");
    const before = state();
    expect((await payAndWalkIn(CLASSES.open.id, "sub-own")).success).toBe(false);
    expectNothingWritten(before);
  });
});

describe("qrMarkPaidAndCheckInAction", () => {
  it("booking with its own pending pass: marks paid, audits, checks in, takes no further credit", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    book("b-1", CLASSES.open.id);
    const res = await payAndCheckIn("b-1", "sub-own");
    expect(res.success).toBe(true);
    expect(h.updateSubscription).toHaveBeenCalledTimes(1);
    expect(h.updateSubscription).toHaveBeenCalledWith("sub-own", expect.objectContaining({ paymentStatus: "paid" }));
    expect(h.logFinanceEvent).toHaveBeenCalledWith(expect.objectContaining({ entityId: "sub-own", action: "marked_paid" }));
    expect(h.checkInBooking).toHaveBeenCalledWith("b-1");
    expect(h.markAttendance).toHaveBeenCalled();
    expect(h.subs.get("sub-own")).toMatchObject({ paymentStatus: "paid", remainingCredits: 3 });
  });

  it("booking without a pass: attaches the paid pass and takes exactly one credit from it", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    pass("sub-own-2");
    book("b-1", CLASSES.open.id, { subscriptionId: null, subscriptionName: null });
    const res = await payAndCheckIn("b-1", "sub-own");
    expect(res.success).toBe(true);
    expect(h.bookings[0]).toMatchObject({ subscriptionId: "sub-own", subscriptionName: "Test Bachata Pass" });
    expect(h.saveBookingToDB).toHaveBeenCalledWith(expect.objectContaining({ id: "b-1", subscriptionId: "sub-own" }));
    expect(h.updateSubscription).toHaveBeenCalledTimes(2);
    expect(h.updateSubscription).toHaveBeenNthCalledWith(1, "sub-own", expect.objectContaining({ paymentStatus: "paid" }));
    expect(h.updateSubscription).toHaveBeenNthCalledWith(2, "sub-own", { remainingCredits: 2 });
    expect(h.subs.get("sub-own")).toMatchObject({ paymentStatus: "paid", remainingCredits: 2 });
    expect(h.subs.get("sub-own-2")).toMatchObject({ remainingCredits: 3 });
    expect(h.checkInBooking).toHaveBeenCalledWith("b-1");
  });

  it("booking without a pass: the pass's last credit is attached and used", async () => {
    signIn("custom", DESK);
    pass("sub-last", { remainingCredits: 1, paymentStatus: "pending" });
    book("b-1", CLASSES.open.id, { subscriptionId: null });
    expect((await payAndCheckIn("b-1", "sub-last")).success).toBe(true);
    expect(h.subs.get("sub-last")).toMatchObject({ remainingCredits: 0, status: "exhausted" });
  });

  const DENIED: [string, () => string, RegExp][] = [
    ["an unrelated student's pass on a booking without one", () => { pending("sub-other"); book("b-1", CLASSES.open.id, { subscriptionId: null }); return "sub-other"; }, /does not belong to the booked student/],
    ["a wrong-style pass on a booking without one", () => { pending("sub-salsa"); book("b-1", CLASSES.open.id, { subscriptionId: null }); return "sub-salsa"; }, /is not valid for/],
    ["an exhausted pass on a booking without one", () => { pending("sub-exhausted"); book("b-1", CLASSES.open.id, { subscriptionId: null }); return "sub-exhausted"; }, /is not valid for/],
    ["a pass on a booking for a class that needs none", () => { pending("sub-own"); book("b-1", CLASSES.social.id, { subscriptionId: null }); return "sub-own"; }, /does not need a pass/],
    ["a different pass than the booking's", () => { pending("sub-own"); pass("sub-own-2", { paymentStatus: "pending" }); book("b-1", CLASSES.open.id); return "sub-own-2"; }, /not the one this booking uses/],
    ["a pass already paid", () => { book("b-1", CLASSES.open.id); return "sub-own"; }, /not awaiting payment/],
    ["an ended class", () => { pending("sub-own"); book("b-1", CLASSES.ended.id); return "sub-own"; }, /ended/],
    ["a cancelled class", () => { pending("sub-own"); book("b-1", CLASSES.cancelled.id); return "sub-own"; }, /cancelled/],
    ["a past class", () => { pending("sub-own"); book("b-1", CLASSES.past.id); return "sub-own"; }, /not today/],
    ["a closed attendance window", () => { pending("sub-own"); book("b-1", CLASSES.closed.id); return "sub-own"; }, /window has closed/],
    ["a wrong-level class", () => { pending("sub-own"); book("b-1", CLASSES.level3.id); return "sub-own"; }, /is not valid for/],
  ];
  for (const [why, setup, error] of DENIED) {
    it(`records no payment for ${why}`, async () => {
      signIn("custom", DESK);
      const subId = setup();
      const before = state();
      const res = await payAndCheckIn("b-1", subId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(error);
      expectNothingWritten(before);
    });
  }

  it("records no payment for a non-checkable booking", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    for (const status of ["cancelled", "late_cancelled", "missed", "checked_in"]) {
      h.bookings.length = 0;
      book("b-1", CLASSES.open.id, { status });
      const before = state();
      expect((await payAndCheckIn("b-1", "sub-own")).success).toBe(false);
      expectNothingWritten(before);
    }
  });

  it("records no payment for a booked pass that is not valid for the class", async () => {
    signIn("custom", DESK);
    // sub-exhausted is at 0 because of the booking's own credit, so it is valid here.
    for (const [, subId] of UNUSABLE_FOR_OPEN.filter(([, id]) => id !== "sub-exhausted")) {
      h.bookings.length = 0;
      pending(subId);
      book("b-1", CLASSES.open.id, { subscriptionId: subId });
      const before = state();
      expect((await payAndCheckIn("b-1", subId)).success).toBe(false);
      expectNothingWritten(before);
    }
  });

  it("allows a class in progress inside the attendance window", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    book("b-1", CLASSES.live.id);
    expect((await payAndCheckIn("b-1", "sub-own")).success).toBe(true);
  });

  it("rejects an unknown booking", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    const before = state();
    expect((await payAndCheckIn("b-missing", "sub-own")).success).toBe(false);
    expectNothingWritten(before);
  });

  it("needs checkin:manual_checkin as well as mark_paid_reception", async () => {
    signIn("custom", ["checkin:scan", "payments:mark_paid_reception"]);
    pending("sub-own");
    book("b-1", CLASSES.open.id);
    const before = state();
    expect((await payAndCheckIn("b-1", "sub-own")).success).toBe(false);
    expectNothingWritten(before);
  });
});

describe("qrSellDropInAndCheckInAction", () => {
  it("sells a drop-in and checks in for a class it covers", async () => {
    signIn("custom", DESK);
    const res = await sellDropIn(CLASSES.open.id);
    expect(res.success).toBe(true);
    expect(h.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s-2", productId: "t-drop", paymentStatus: "paid" }));
    expect(h.markAttendance).toHaveBeenCalledWith(expect.objectContaining({ bookableClassId: CLASSES.open.id }));
  });

  it("if check-in fails after the sale, the drop-in is kept and staff are told so", async () => {
    signIn("custom", DESK);
    h.createSubscription.mockImplementation(async (input: Record<string, unknown>) => {
      h.subs.set("sub-sold", { id: "sub-sold", ...input });
      // Another device booked the student in the meantime.
      book("b-race", CLASSES.open.id);
      return { success: true, subscriptionId: "sub-sold" };
    });
    const res = await sellDropIn(CLASSES.open.id);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^The drop-in was sold and stays on the student's account, but check-in failed: Student already has a booking/);
    expect(h.createSubscription).toHaveBeenCalledTimes(1);
    expect(h.subs.get("sub-sold")).toMatchObject({ paymentStatus: "paid", remainingCredits: 1, status: "active", validUntil: null });
    expect(h.updateSubscription).not.toHaveBeenCalled();
    expect(h.markAttendance).not.toHaveBeenCalled();
  });

  it("does not sell a drop-in the class would not accept", async () => {
    signIn("custom", DESK);
    const before = state();
    const res = await sellDropIn(CLASSES.social.id);
    expect(res.error).toMatch(/is not valid for/);
    expectNothingWritten(before);
  });

  it("does not sell a drop-in for an ended, cancelled or earlier class", async () => {
    signIn("custom", DESK);
    const before = state();
    for (const c of [CLASSES.ended, CLASSES.cancelled, CLASSES.past]) {
      expect((await sellDropIn(c.id)).success).toBe(false);
    }
    expectNothingWritten(before);
  });

  it("does not sell a drop-in when the student is already booked", async () => {
    signIn("custom", DESK);
    book("b-1", CLASSES.open.id);
    const before = state();
    expect((await sellDropIn(CLASSES.open.id)).success).toBe(false);
    expectNothingWritten(before);
  });

  it("does not sell a drop-in when the user cannot check the student in", async () => {
    signIn("custom", ["checkin:scan", "payments:mark_paid_reception"]);
    const before = state();
    expect((await sellDropIn(CLASSES.open.id)).success).toBe(false);
    expectNothingWritten(before);
  });
});

describe("QR lookup offers what the server accepts", () => {
  async function lookup() {
    const { lookupStudentByQrAction } = await import("../qr-checkin");
    return lookupStudentByQrAction(STUDENT_TWO_QR);
  }

  it("a booking without a pass offers the student's pending pass to pay and attach", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    book("b-1", CLASSES.open.id, { subscriptionId: null });
    const b = (await lookup()).todayBookings!.find((x) => x.bookingId === "b-1")!;
    expect(b.canCheckIn).toBe(true);
    expect(b.entitlement).toMatchObject({ subscriptionId: "sub-own", paymentStatus: "pending" });
  });

  it("a booking without a pass and no pending pass to pay cannot be checked in", async () => {
    signIn("custom", DESK);
    book("b-1", CLASSES.open.id, { subscriptionId: null });
    const b = (await lookup()).todayBookings!.find((x) => x.bookingId === "b-1")!;
    expect(b.canCheckIn).toBe(false);
    expect(b.blockedReason).toMatch(/no pass attached/);
    expect((await checkIn("b-1")).error).toBe(b.blockedReason);
  });

  it("a pending booked pass is shown as pending (the panel only offers mark-paid)", async () => {
    signIn("custom", DESK);
    pending("sub-own");
    book("b-1", CLASSES.open.id);
    const b = (await lookup()).todayBookings!.find((x) => x.bookingId === "b-1")!;
    expect(b.entitlement?.paymentStatus).toBe("pending");
    expect((await checkIn("b-1")).error).toBe(PAYMENT_NOT_CONFIRMED);
  });

  it("a refunded booked pass cannot be checked in, with the server's reason", async () => {
    signIn("custom", DESK);
    pass("sub-own", { paymentStatus: "refunded" });
    book("b-1", CLASSES.open.id);
    const b = (await lookup()).todayBookings!.find((x) => x.bookingId === "b-1")!;
    expect(b.canCheckIn).toBe(false);
    expect(b.blockedReason).toBe(PAYMENT_NOT_CONFIRMED);
  });
});
