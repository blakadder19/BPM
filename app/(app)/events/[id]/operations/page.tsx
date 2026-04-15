import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
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
  const user = await requireRole(["admin"]);

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

  return (
    <EventOperations
      event={event}
      products={products}
      purchases={purchases}
      studentInfoMap={studentInfoMap}
      currentUserId={user.id}
    />
  );
}
