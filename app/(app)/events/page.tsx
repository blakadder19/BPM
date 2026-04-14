import { requireRole } from "@/lib/auth";
import {
  cachedGetAllEvents,
  cachedGetStudentEventPurchases,
} from "@/lib/server/cached-queries";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminEvents } from "@/components/events/admin-events";
import { StudentEvents } from "@/components/events/student-events";
import { getSpecialEventRepo } from "@/lib/repositories";

export default async function EventsPage() {
  const user = await requireRole(["admin", "student"]);
  await ensureOperationalDataHydrated();

  if (user.role === "student") {
    const events = await cachedGetAllEvents();
    const published = events.filter((e) => e.status === "published" && e.isVisible);
    const myPurchases = await cachedGetStudentEventPurchases(user.id);
    return <StudentEvents events={published} purchases={myPurchases} />;
  }

  const events = await cachedGetAllEvents();

  const repo = getSpecialEventRepo();
  const sessionCountMap: Record<string, number> = {};
  const productCountMap: Record<string, number> = {};
  for (const evt of events) {
    const [sessions, products] = await Promise.all([
      repo.getSessionsByEvent(evt.id),
      repo.getProductsByEvent(evt.id),
    ]);
    sessionCountMap[evt.id] = sessions.length;
    productCountMap[evt.id] = products.length;
  }

  return (
    <AdminEvents
      events={events}
      sessionCountMap={sessionCountMap}
      productCountMap={productCountMap}
    />
  );
}
