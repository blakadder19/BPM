/**
 * Write guards that sit under a broad page permission:
 *   - `students:edit` edits the entitlement but never payment status, and
 *     never overwrites payment details the caller was not shown;
 *   - each attendance status needs its own key, the actor comes from the
 *     session, and booking/subscription ids must belong to the student.
 * Uses the real staff-access resolver.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
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
  markAttendance: vi.fn(),
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
    checkInBooking: vi.fn(),
    restoreFromMissed: vi.fn(),
    markMissedFromAttendance: vi.fn(),
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
    getAllPenalties: () => [],
    assessNoShowPenalty: () => ({ penaltyCreated: false, description: null, penalty: null }),
    updateResolution: vi.fn(),
  }),
}));
vi.mock("@/lib/supabase/operational-persistence", () => ({
  saveAttendanceToDB: vi.fn(),
  saveBookingToDB: vi.fn(),
  savePenaltyToDB: vi.fn(),
  updatePenaltyInDB: vi.fn(),
  deleteAttendanceFromDB: vi.fn(),
}));
vi.mock("@/lib/utils/is-real-user", () => ({ isRealUser: () => false }));

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
  h.markAttendance.mockReset();
  h.markAttendance.mockReturnValue({ type: "created", record: { source: "booking", subscriptionId: null } });
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

async function mark(over: Record<string, unknown> = {}) {
  const { markStudentAttendance } = await import("../attendance");
  return markStudentAttendance({
    bookableClassId: "c-1",
    studentId: "s-1",
    studentName: "Spoofed Name",
    bookingId: null,
    classTitle: "Bachata 1",
    date: "2026-10-01",
    classType: "class",
    danceStyleId: null,
    level: null,
    status: "present",
    markedBy: "Someone Else",
    ...over,
  } as Parameters<typeof markStudentAttendance>[0]);
}

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
