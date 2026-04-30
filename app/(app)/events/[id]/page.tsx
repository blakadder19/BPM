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
  cachedGetAllStudents,
  cachedCocCheck,
} from "@/lib/server/cached-queries";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminEventDetail } from "@/components/events/admin-event-detail";
import { StudentEventDetail } from "@/components/events/student-event-detail";
import { isStripeEnabled } from "@/lib/stripe";

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
    if (event.status !== "published" || !event.isVisible) notFound();
    const myPurchases = await cachedGetStudentEventPurchases(user.id);
    const eventPurchases = myPurchases.filter((p) => p.eventId === id);
    return (
      <StudentEventDetail
        event={event}
        sessions={sessions}
        products={products.filter((p) => p.isVisible)}
        myPurchases={eventPurchases}
        stripeEnabled={isStripeEnabled()}
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
    canRefund: hasPermission(access, "events:edit"),
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
