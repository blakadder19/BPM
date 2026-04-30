import { notFound } from "next/navigation";
import { hasPermission, requireAnyPermission } from "@/lib/staff-permissions";
import {
  cachedGetEventById,
  cachedGetEventProducts,
  cachedGetEventPurchases,
  cachedGetAllStudents,
} from "@/lib/server/cached-queries";
import { EventOperations } from "@/components/events/event-operations";

export default async function EventOperationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Operations page mixes view + write actions (mark paid, etc.).
  // Allow anyone with at least events:view; individual mutating
  // server actions enforce events:edit / events:mark_paid separately.
  const access = await requireAnyPermission(["events:view"]);
  const user = access.user;

  const event = await cachedGetEventById(id);
  if (!event) notFound();

  const [products, purchases, students] = await Promise.all([
    cachedGetEventProducts(id),
    cachedGetEventPurchases(id),
    cachedGetAllStudents(),
  ]);

  const studentInfoMap: Record<string, { fullName: string; email: string }> = {};
  for (const s of students) {
    studentInfoMap[s.id] = { fullName: s.fullName, email: s.email };
  }

  const permissions = {
    canCheckIn: hasPermission(access, "checkin:manual_checkin"),
    canCollectPayment: hasPermission(access, "payments:mark_paid_reception"),
  };

  return (
    <EventOperations
      event={event}
      products={products}
      purchases={purchases}
      studentInfoMap={studentInfoMap}
      currentUserId={user.id}
      permissions={permissions}
    />
  );
}
