/**
 * Ownership and permission guards on student notices, token check-in and
 * event collect-payment check-in.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";

const h = vi.hoisted(() => ({
  currentUser: null as AuthUser | null,
  row: null as StaffMember | null,
  dismissNotification: vi.fn(async () => {}),
  findByCheckInToken: vi.fn(),
  getEventById: vi.fn(),
  updatePurchasePayment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  getAuthUser: async () => h.currentUser,
  requireAuth: async () => {
    if (!h.currentUser) throw new Error("REDIRECT:/login");
    return h.currentUser;
  },
}));
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => h.row }),
  getSpecialEventRepo: () => ({ getEventById: h.getEventById }),
  getStudentRepo: () => ({ getById: async () => null }),
}));
vi.mock("@/lib/communications/notification-store", () => ({
  dismissNotification: h.dismissNotification,
}));
vi.mock("@/lib/utils/is-real-user", () => ({ isRealUser: () => true }));
vi.mock("@/lib/supabase/hydrate-operational", () => ({
  ensureOperationalDataHydrated: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/booking-store", () => ({
  getBookingService: () => ({ findByCheckInToken: h.findByCheckInToken }),
}));
vi.mock("@/lib/services/special-event-service", () => ({
  updatePurchaseCheckIn: vi.fn(),
  updatePurchasePayment: h.updatePurchasePayment,
}));
vi.mock("@/lib/services/event-payment-email", () => ({
  sendPaymentConfirmationEmail: vi.fn(),
}));

const user = (id: string, role: AuthUser["role"]): AuthUser => ({
  id,
  email: `${id}@example.test`,
  fullName: id,
  role,
  avatarUrl: null,
  academyId: "a-1",
  emailConfirmed: true,
});

const row = (over: Partial<StaffMember>): StaffMember => ({
  id: "u-1",
  email: "u-1@example.test",
  fullName: "u-1",
  legacyRole: "student",
  roleKey: null,
  permissions: [],
  status: "active",
  invitedBy: null,
  updatedAt: null,
  createdAt: null,
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  h.currentUser = null;
  h.row = null;
  h.dismissNotification.mockClear();
  h.findByCheckInToken.mockReset();
  h.getEventById.mockReset();
  h.updatePurchasePayment.mockReset();
  (globalThis as Record<string, unknown>).__bpm_class_cancellation_notices = [];
});

describe("dismissStudentNoticeAction", () => {
  it("scopes the DB delete to the signed-in student", async () => {
    h.currentUser = user("student-a", "student");
    const { dismissStudentNoticeAction } = await import("../student-notifications");
    await dismissStudentNoticeAction("notice-of-student-b");
    expect(h.dismissNotification).toHaveBeenCalledWith("notice-of-student-b", "student-a");
  });

  it("cannot remove another student's in-memory notice", async () => {
    const store = await import("@/lib/services/class-cancellation-store");
    const [notice] = store.addClassCancellationNotices([
      {
        studentId: "student-b",
        studentName: "B",
        classTitle: "Salsa",
        classDate: "2026-10-01",
        startTime: "19:00",
        creditReverted: true,
      },
    ]);
    h.currentUser = user("student-a", "student");
    const { dismissStudentNoticeAction } = await import("../student-notifications");
    await dismissStudentNoticeAction(notice.id);
    expect(store.getNoticesForStudent("student-b")).toHaveLength(1);
  });
});

describe("validateTokenCheckInAction", () => {
  it("rejects an unauthenticated caller before looking up the token", async () => {
    const { validateTokenCheckInAction } = await import("../checkin");
    const res = await validateTokenCheckInAction("ANYTOKEN");
    expect(res.success).toBe(false);
    expect(h.findByCheckInToken).not.toHaveBeenCalled();
  });

  it("rejects a student", async () => {
    h.currentUser = user("student-a", "student");
    h.row = row({ id: "student-a" });
    const { validateTokenCheckInAction } = await import("../checkin");
    const res = await validateTokenCheckInAction("ANYTOKEN");
    expect(res.success).toBe(false);
    expect(h.findByCheckInToken).not.toHaveBeenCalled();
  });
});

describe("eventCollectPaymentAndCheckInAction", () => {
  it("requires a payment permission in addition to checkin:scan", async () => {
    h.currentUser = user("scanner", "admin");
    h.row = row({
      id: "scanner",
      legacyRole: "admin",
      roleKey: "custom",
      permissions: ["dashboard:view", "checkin:view", "checkin:scan"],
    });
    const { eventCollectPaymentAndCheckInAction } = await import("../event-checkin");
    const res = await eventCollectPaymentAndCheckInAction({
      purchaseId: "p-1",
      eventId: "e-1",
      receptionMethod: "cash",
    });
    expect(res.success).toBe(false);
    expect(h.getEventById).not.toHaveBeenCalled();
    expect(h.updatePurchasePayment).not.toHaveBeenCalled();
  });
});
