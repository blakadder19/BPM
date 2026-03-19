"use server";

import { revalidatePath } from "next/cache";
import { STUDENTS, PRODUCTS, TERMS } from "@/lib/mock-data";
import {
  getSubscriptions,
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-store";
import { getBookingRepo, getPenaltyRepo, getStudentRepo, getCocRepo } from "@/lib/repositories";
import { getInstances } from "@/lib/services/schedule-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import type { DanceRole } from "@/types/domain";

function guardDev() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Dev tools are not available in production.");
  }
}

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/classes");
  revalidatePath("/bookings");
  revalidatePath("/penalties");
  revalidatePath("/students");
}

// ── Data fetchers ────────────────────────────────────────────

export async function devGetStudentState(studentId: string) {
  guardDev();

  const { CURRENT_CODE_OF_CONDUCT } = await import("@/config/code-of-conduct");
  const cocAccepted = await getCocRepo().hasAcceptedVersion(studentId, CURRENT_CODE_OF_CONDUCT.version);

  const mockStudent = STUDENTS.find((s) => s.id === studentId);

  if (!mockStudent) {
    // Real Supabase user not in mock data — try the repository,
    // then return a minimal shell state so the DevPanel renders.
    const repoStudent = await getStudentRepo().getById(studentId);
    return {
      student: {
        id: studentId,
        fullName: repoStudent?.fullName ?? "(real user)",
        preferredRole: repoStudent?.preferredRole ?? null,
        cocAccepted,
      },
      subscriptions: [] as {
        id: string; productName: string; productType: string;
        status: string; classesUsed: number; classesPerTerm: number | null;
        remainingCredits: number | null; totalCredits: number | null;
        paymentMethod: string | null; paymentStatus: string | null;
      }[],
      bookings: [] as { id: string; classTitle: string; date: string; status: string; subscriptionId: string | null }[],
      waitlist: [] as { id: string; classTitle: string; date: string; position: number }[],
      penalties: [] as { id: string; classTitle: string; reason: string; amountCents: number; resolution: string }[],
    };
  }

  const subs = getSubscriptions().filter((s) => s.studentId === studentId);
  const svc = getBookingRepo().getService();
  const bookings = svc.getBookingsForStudent(studentId);
  const waitlist = svc.getWaitlistForStudent(studentId);
  const penaltySvc = getPenaltyRepo().getService();
  const penalties = penaltySvc.penalties.filter((p) => p.studentId === studentId);

  return {
    student: {
      id: mockStudent.id,
      fullName: mockStudent.fullName,
      preferredRole: mockStudent.preferredRole,
      cocAccepted,
    },
    subscriptions: subs.map((s) => ({
      id: s.id,
      productName: s.productName,
      productType: s.productType,
      status: s.status,
      classesUsed: s.classesUsed,
      classesPerTerm: s.classesPerTerm,
      remainingCredits: s.remainingCredits,
      totalCredits: s.totalCredits,
      paymentMethod: s.paymentMethod,
      paymentStatus: s.paymentStatus,
    })),
    bookings: bookings
      .filter((b) => b.status === "confirmed" || b.status === "checked_in")
      .map((b) => {
        const cls = svc.getClass(b.bookableClassId);
        return {
          id: b.id,
          classTitle: cls?.title ?? "Unknown",
          date: cls?.date ?? "",
          status: b.status,
          subscriptionId: b.subscriptionId,
        };
      }),
    waitlist: waitlist.map((w) => {
      const cls = svc.getClass(w.bookableClassId);
      return {
        id: w.id,
        classTitle: cls?.title ?? "Unknown",
        date: cls?.date ?? "",
        position: w.position,
      };
    }),
    penalties: penalties.map((p) => ({
      id: p.id,
      classTitle: p.classTitle,
      reason: p.reason,
      amountCents: p.amountCents,
      resolution: p.resolution,
    })),
  };
}

export async function devGetProducts(): Promise<
  { id: string; name: string; productType: string; classesPerTerm: number | null; totalCredits: number | null }[]
> {
  guardDev();
  return PRODUCTS.filter((p) => p.isActive).map((p) => ({
    id: p.id,
    name: p.name,
    productType: p.productType,
    classesPerTerm: p.classesPerTerm,
    totalCredits: p.totalCredits,
  }));
}

export async function devGetOpenClasses(): Promise<
  { id: string; title: string; date: string; startTime: string; requiresRole: boolean }[]
> {
  guardDev();
  const instances = getInstances();
  const today = new Date().toISOString().slice(0, 10);
  return instances
    .filter((c) => (c.status === "open" || c.status === "scheduled") && c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => {
      const style = c.styleName
        ? DANCE_STYLES.find((s) => s.name === c.styleName)
        : null;
      return {
        id: c.id,
        title: c.title,
        date: c.date,
        startTime: c.startTime,
        requiresRole: style?.requiresRoleBalance ?? false,
      };
    });
}

// ── Entitlement mutations ────────────────────────────────────

async function resolveStudentName(studentId: string): Promise<string | null> {
  const mock = STUDENTS.find((s) => s.id === studentId);
  if (mock) return mock.fullName;
  const repo = await getStudentRepo().getById(studentId);
  return repo?.fullName ?? null;
}

export async function devAssignProduct(
  studentId: string,
  productId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const studentName = await resolveStudentName(studentId);
  if (!studentName) return { success: false, error: "Student not found" };
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return { success: false, error: "Product not found" };

  const activeTerm = TERMS.find((t) => t.status === "active");

  createSubscription({
    studentId,
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    status: "active",
    totalCredits: product.totalCredits,
    remainingCredits: product.totalCredits,
    validFrom: activeTerm?.startDate ?? new Date().toISOString().slice(0, 10),
    validUntil: activeTerm?.endDate ?? null,
    notes: "Created via dev tools",
    termId: product.termBound && activeTerm ? activeTerm.id : null,
    paymentMethod: "manual",
    paymentStatus: "complimentary",
    assignedBy: "Dev Tools",
    assignedAt: new Date().toISOString(),
    autoRenew: product.autoRenew,
    classesUsed: 0,
    classesPerTerm: product.classesPerTerm,
  });

  revalidateAll();
  return { success: true };
}

export async function devRemoveEntitlement(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const result = updateSubscription(subscriptionId, { status: "exhausted" });
  if (!result) return { success: false, error: "Subscription not found" };
  revalidateAll();
  return { success: true };
}

export async function devResetEntitlement(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const subs = getSubscriptions();
  const sub = subs.find((s) => s.id === subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  const patch: Parameters<typeof updateSubscription>[1] = {
    status: "active",
    classesUsed: 0,
  };
  if (sub.totalCredits !== null) {
    patch.remainingCredits = sub.totalCredits;
  }
  updateSubscription(subscriptionId, patch);
  revalidateAll();
  return { success: true };
}

// ── Booking mutations ────────────────────────────────────────

export async function devAddBooking(
  studentId: string,
  classId: string,
  danceRole: DanceRole | null
): Promise<{ success: boolean; error?: string; result?: string }> {
  guardDev();
  const studentName = await resolveStudentName(studentId);
  if (!studentName) return { success: false, error: "Student not found" };

  const svc = getBookingRepo().getService();

  const instances = getInstances();
  svc.refreshClasses(
    instances.map((bc) => {
      const style = bc.styleName
        ? DANCE_STYLES.find((s) => s.name === bc.styleName)
        : null;
      return {
        id: bc.id,
        title: bc.title,
        classType: bc.classType,
        styleName: bc.styleName,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        status: bc.status,
        date: bc.date,
        startTime: bc.startTime,
        endTime: bc.endTime,
        maxCapacity: bc.maxCapacity,
        leaderCap: bc.leaderCap,
        followerCap: bc.followerCap,
        location: bc.location,
      };
    })
  );

  const outcome = svc.adminBook({
    bookableClassId: classId,
    studentId,
    studentName,
    danceRole,
    source: "admin",
    subscriptionName: "Dev Tools",
    forceConfirm: true,
  });

  revalidateAll();

  if (outcome.type === "rejected") {
    return { success: false, error: outcome.reason };
  }
  return { success: true, result: outcome.type };
}

export async function devCancelBooking(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const svc = getBookingRepo().getService();
  const result = svc.cancelBooking(bookingId);
  revalidateAll();
  if (result.type === "error") return { success: false, error: result.reason };
  return { success: true };
}

// ── Waitlist mutations ───────────────────────────────────────

export async function devJoinWaitlist(
  studentId: string,
  classId: string,
  danceRole: DanceRole | null
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const studentName = await resolveStudentName(studentId);
  if (!studentName) return { success: false, error: "Student not found" };

  const svc = getBookingRepo().getService();

  const instances = getInstances();
  svc.refreshClasses(
    instances.map((bc) => {
      const style = bc.styleName
        ? DANCE_STYLES.find((s) => s.name === bc.styleName)
        : null;
      return {
        id: bc.id,
        title: bc.title,
        classType: bc.classType,
        styleName: bc.styleName,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        status: bc.status,
        date: bc.date,
        startTime: bc.startTime,
        endTime: bc.endTime,
        maxCapacity: bc.maxCapacity,
        leaderCap: bc.leaderCap,
        followerCap: bc.followerCap,
        location: bc.location,
      };
    })
  );

  const outcome = svc.bookClass({
    bookableClassId: classId,
    studentId,
    studentName,
    danceRole,
  });

  revalidateAll();

  if (outcome.type === "rejected") return { success: false, error: outcome.reason };
  return { success: true };
}

export async function devLeaveWaitlist(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const svc = getBookingRepo().getService();
  const removed = svc.removeFromWaitlist(waitlistId);
  revalidateAll();
  if (!removed) return { success: false, error: "Entry not found" };
  return { success: true };
}

// ── Penalty mutations ────────────────────────────────────────

export async function devAddPenalty(
  studentId: string,
  reason: "late_cancel" | "no_show"
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const studentName = await resolveStudentName(studentId);
  if (!studentName) return { success: false, error: "Student not found" };

  const penaltySvc = getPenaltyRepo().getService();
  penaltySvc.addPenalty({
    studentId,
    studentName,
    bookingId: null,
    bookableClassId: "dev-class",
    classTitle: "Dev Test Class",
    classDate: new Date().toISOString().slice(0, 10),
    reason,
    amountCents: reason === "no_show" ? 500 : 200,
    resolution: "monetary_pending",
    subscriptionId: null,
    creditDeducted: 0,
    notes: "Created via dev tools",
  });

  revalidateAll();
  return { success: true };
}

export async function devWaivePenalty(
  penaltyId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const penaltySvc = getPenaltyRepo().getService();
  const penalty = penaltySvc.penalties.find((p) => p.id === penaltyId);
  if (!penalty) return { success: false, error: "Penalty not found" };
  penalty.resolution = "waived";
  penalty.notes = (penalty.notes ? penalty.notes + " | " : "") + "Waived via dev tools";
  revalidateAll();
  return { success: true };
}

// ── Student mutations ────────────────────────────────────────

export async function devSwitchRole(
  studentId: string
): Promise<{ success: boolean; newRole?: string; error?: string }> {
  guardDev();
  const mock = STUDENTS.find((s) => s.id === studentId);
  if (mock) {
    mock.preferredRole = mock.preferredRole === "leader" ? "follower" : "leader";
    revalidateAll();
    return { success: true, newRole: mock.preferredRole };
  }
  // Real user — toggle via repository
  const repo = getStudentRepo();
  const student = await repo.getById(studentId);
  if (!student) return { success: false, error: "Student not found" };
  const newRole = student.preferredRole === "leader" ? "follower" : "leader";
  await repo.update(studentId, { preferredRole: newRole });
  revalidateAll();
  return { success: true, newRole };
}

// ── Code of Conduct mutations ───────────────────────────────

export async function devAcceptCoc(
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const { CURRENT_CODE_OF_CONDUCT } = await import("@/config/code-of-conduct");
  await getCocRepo().accept(studentId, CURRENT_CODE_OF_CONDUCT.version);
  revalidateAll();
  return { success: true };
}

export async function devRevokeCoc(
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  await getCocRepo().revoke(studentId);
  revalidateAll();
  return { success: true };
}
