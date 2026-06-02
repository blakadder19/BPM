import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import {
  cachedGetEventById,
  cachedGetEventSessions,
  cachedGetEventProducts,
  cachedGetEventPurchases,
  cachedGetStudentEventPurchases,
  cachedGetStudentSubs,
  cachedGetAllStudents,
  cachedCocCheck,
} from "@/lib/server/cached-queries";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminEventDetail } from "@/components/events/admin-event-detail";
import { StudentEventDetail } from "@/components/events/student-event-detail";
import { isStripeEnabled } from "@/lib/stripe";
import { hasActiveMembership } from "@/lib/domain/active-membership";
import { shouldShowEventToStudent } from "@/lib/domain/event-visibility";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  if (user.role !== "student") {
    await requirePermission("events:view");
  }
  await ensureOperationalDataHydrated();

  const event = await cachedGetEventById(id);
  if (!event) notFound();

  const [sessions, products] = await Promise.all([
    cachedGetEventSessions(id),
    cachedGetEventProducts(id),
  ]);

  if (user.role === "student") {
    const cocDone = await cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version);
    if (!cocDone) redirect("/onboarding");
    // Phase 4: shouldShowEventToStudent additionally excludes archived
    // events. Direct URL access to an archived event 404s.
    if (!shouldShowEventToStudent(event)) notFound();
    const [myPurchases, mySubs] = await Promise.all([
      cachedGetStudentEventPurchases(user.id),
      cachedGetStudentSubs(user.id),
    ]);
    const eventPurchases = myPurchases.filter((p) => p.eventId === id);
    const today = new Date().toISOString().slice(0, 10);
    const isActiveMember = hasActiveMembership(mySubs, today);
    return (
      <StudentEventDetail
        event={event}
        sessions={sessions}
        products={products.filter((p) => p.isVisible)}
        myPurchases={eventPurchases}
        stripeEnabled={isStripeEnabled()}
        isActiveMember={isActiveMember}
        studentId={user.id}
      />
    );
  }

  const [purchases, students, access] = await Promise.all([
    cachedGetEventPurchases(id),
    cachedGetAllStudents(),
    getStaffAccess(),
  ]);

  const studentInfoMap: Record<string, { fullName: string; email: string }> = {};
  for (const s of students) {
    studentInfoMap[s.id] = { fullName: s.fullName, email: s.email };
  }

  const permissions = {
    canEdit: hasPermission(access, "events:edit"),
    canDelete: hasPermission(access, "events:delete"),
    canMarkPaid: hasPermission(access, "events:mark_paid"),
    // Phase 5 (Stripe refunds): refunds are now gated on the dedicated
    // finance:refund / payments:refund permissions rather than the
    // broad events:edit permission. UI hiding is just the surface — the
    // server actions (`refundEventPurchaseAction`, `issueStripeRefundAction`)
    // independently enforce the same gate.
    canRefund: hasPermission(access, "finance:refund") || hasPermission(access, "payments:refund"),
    canScan: hasPermission(access, "checkin:scan"),
  };

  return (
    <AdminEventDetail
      event={event}
      sessions={sessions}
      products={products}
      purchases={purchases}
      studentInfoMap={studentInfoMap}
      permissions={permissions}
    />
  );
}
