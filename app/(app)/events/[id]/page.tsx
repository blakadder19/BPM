import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  cachedGetEventById,
  cachedGetEventSessions,
  cachedGetEventProducts,
  cachedGetEventPurchases,
  cachedGetStudentEventPurchases,
  cachedGetAllStudents,
} from "@/lib/server/cached-queries";
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
  const user = await requireRole(["admin", "student"]);
  await ensureOperationalDataHydrated();

  const event = await cachedGetEventById(id);
  if (!event) notFound();

  const [sessions, products] = await Promise.all([
    cachedGetEventSessions(id),
    cachedGetEventProducts(id),
  ]);

  if (user.role === "student") {
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

  const [purchases, students] = await Promise.all([
    cachedGetEventPurchases(id),
    cachedGetAllStudents(),
  ]);

  const studentInfoMap: Record<string, { fullName: string; email: string }> = {};
  for (const s of students) {
    studentInfoMap[s.id] = { fullName: s.fullName, email: s.email };
  }

  return (
    <AdminEventDetail
      event={event}
      sessions={sessions}
      products={products}
      purchases={purchases}
      studentInfoMap={studentInfoMap}
    />
  );
}
