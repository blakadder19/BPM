"use server";

import { revalidatePath } from "next/cache";
import { STUDENTS, DANCE_STYLES } from "@/lib/mock-data";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import {
  getBookingRepo,
  getPenaltyRepo,
  getStudentRepo,
  getCocRepo,
  getSubscriptionRepo,
  getProductRepo,
  getTermRepo,
} from "@/lib/repositories";
import { getInstances } from "@/lib/services/schedule-store";
import type { DanceRole } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveBookingToDB, saveWaitlistToDB, deleteWaitlistFromDB, savePenaltyToDB, updatePenaltyInDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { buildSnapshotFromProduct } from "@/lib/services/subscription-snapshot-service";

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
  await ensureOperationalDataHydrated();

  const { CURRENT_CODE_OF_CONDUCT } = await import("@/config/code-of-conduct");
  const cocAccepted = await getCocRepo().hasAcceptedVersion(studentId, CURRENT_CODE_OF_CONDUCT.version);

  // Resolve student from repo (handles both mock and real users)
  const student = await getStudentRepo().getById(studentId);

  // Fetch subscriptions from repo (hybrid: memory + Supabase)
  const subs = await getSubscriptionRepo().getByStudent(studentId);

  // Fetch bookings, waitlist, penalties from in-memory services
  const svc = getBookingRepo().getService();
  const bookings = svc.getBookingsForStudent(studentId);
  const waitlist = svc.getWaitlistForStudent(studentId);
  const penaltySvc = getPenaltyRepo().getService();
  const penalties = penaltySvc.penalties.filter((p) => p.studentId === studentId);

  return {
    student: {
      id: studentId,
      fullName: student?.fullName ?? "(unknown user)",
      preferredRole: student?.preferredRole ?? null,
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
  const products = await getProductRepo().getAll();
  return products.filter((p) => p.isActive && !p.archivedAt).map((p) => ({
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
  const repo = await getStudentRepo().getById(studentId);
  if (repo) return repo.fullName;
  const mock = STUDENTS.find((s) => s.id === studentId);
  return mock?.fullName ?? null;
}

export async function devAssignProduct(
  studentId: string,
  productId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const studentName = await resolveStudentName(studentId);
  if (!studentName) return { success: false, error: "Student not found" };
  const product = await getProductRepo().getById(productId);
  if (!product) return { success: false, error: "Product not found" };

  const terms = await getTermRepo().getAll();
  const { deriveTermStatus } = await import("@/lib/domain/term-rules");
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeTerm = terms.find((t) => deriveTermStatus(t, todayStr) === "active");

  // Phase 1: snapshot live product state so dev-assigned subs behave the
  // same as real-purchase subs under product edits.
  const productSnapshot = await buildSnapshotFromProduct(product);

  const result = await createSubscription({
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
    assignedBy: null,
    assignedAt: new Date().toISOString(),
    autoRenew: product.autoRenew,
    classesUsed: 0,
    classesPerTerm: product.classesPerTerm,
    priceCentsAtPurchase: product.priceCents,
    currencyAtPurchase: "EUR",
    productSnapshot,
  });

  revalidateAll();
  return result;
}

export async function devRemoveEntitlement(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const result = await updateSubscription(subscriptionId, { status: "exhausted" });
  if (!result.success) return { success: false, error: result.error ?? "Subscription not found" };
  revalidateAll();
  return { success: true };
}

export async function devResetEntitlement(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  const patch: { status: "active"; classesUsed: number; remainingCredits?: number | null } = {
    status: "active",
    classesUsed: 0,
  };
  if (sub.totalCredits !== null) {
    patch.remainingCredits = sub.totalCredits;
  }
  const result = await updateSubscription(subscriptionId, patch);
  if (!result.success) return { success: false, error: result.error ?? "Update failed" };
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
  await ensureOperationalDataHydrated();
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

  if (isRealUser(studentId) && outcome.type === "confirmed") {
    const booking = svc.bookings.find((b) => b.id === outcome.bookingId);
    if (booking) await saveBookingToDB(booking);
  }

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
  await ensureOperationalDataHydrated();
  const svc = getBookingRepo().getService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  const result = svc.cancelBooking(bookingId);
  if (result.type === "error") return { success: false, error: result.reason };
  if (booking && isRealUser(booking.studentId)) {
    const updated = svc.bookings.find((b) => b.id === bookingId);
    if (updated) await saveBookingToDB(updated);
  }
  revalidateAll();
  return { success: true };
}

// ── Waitlist mutations ───────────────────────────────────────

export async function devJoinWaitlist(
  studentId: string,
  classId: string,
  danceRole: DanceRole | null
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  await ensureOperationalDataHydrated();
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

  if (isRealUser(studentId)) {
    if (outcome.type === "confirmed") {
      const booking = svc.bookings.find((b) => b.id === outcome.bookingId);
      if (booking) await saveBookingToDB(booking);
    } else if (outcome.type === "waitlisted") {
      const entry = svc.waitlist.find((w) => w.id === outcome.waitlistId);
      if (entry) await saveWaitlistToDB(entry);
    }
  }

  revalidateAll();

  if (outcome.type === "rejected") return { success: false, error: outcome.reason };
  return { success: true };
}

export async function devLeaveWaitlist(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  await ensureOperationalDataHydrated();
  const svc = getBookingRepo().getService();
  const entry = svc.waitlist.find((w) => w.id === waitlistId);
  const removed = svc.removeFromWaitlist(waitlistId);
  if (!removed) return { success: false, error: "Entry not found" };
  if (entry && isRealUser(entry.studentId)) await deleteWaitlistFromDB(waitlistId);
  revalidateAll();
  return { success: true };
}

// ── Penalty mutations ────────────────────────────────────────

export async function devAddPenalty(
  studentId: string,
  reason: "late_cancel" | "no_show"
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  await ensureOperationalDataHydrated();
  const studentName = await resolveStudentName(studentId);
  if (!studentName) return { success: false, error: "Student not found" };

  const penaltySvc = getPenaltyRepo().getService();
  const penalty = penaltySvc.addPenalty({
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
  if (isRealUser(studentId)) await savePenaltyToDB(penalty);

  revalidateAll();
  return { success: true };
}

export async function devWaivePenalty(
  penaltyId: string
): Promise<{ success: boolean; error?: string }> {
  guardDev();
  await ensureOperationalDataHydrated();
  const penaltySvc = getPenaltyRepo().getService();
  const penalty = penaltySvc.penalties.find((p) => p.id === penaltyId);
  if (!penalty) return { success: false, error: "Penalty not found" };
  penalty.resolution = "waived";
  penalty.notes = (penalty.notes ? penalty.notes + " | " : "") + "Waived via dev tools";
  if (isRealUser(penalty.studentId)) {
    await updatePenaltyInDB(penaltyId, { resolution: "waived", notes: penalty.notes });
  }
  revalidateAll();
  return { success: true };
}

// ── Student mutations ────────────────────────────────────────

export async function devSwitchRole(
  studentId: string
): Promise<{ success: boolean; newRole?: string; error?: string }> {
  guardDev();
  const repo = getStudentRepo();
  const student = await repo.getById(studentId);
  if (student) {
    const newRole = student.preferredRole === "leader" ? "follower" : "leader";
    await repo.update(studentId, { preferredRole: newRole });
    revalidateAll();
    return { success: true, newRole };
  }
  const mock = STUDENTS.find((s) => s.id === studentId);
  if (mock) {
    mock.preferredRole = mock.preferredRole === "leader" ? "follower" : "leader";
    revalidateAll();
    return { success: true, newRole: mock.preferredRole };
  }
  return { success: false, error: "Student not found" };
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
