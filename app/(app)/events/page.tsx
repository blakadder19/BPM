import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/staff-permissions";
import {
  cachedGetAllEvents,
  cachedGetStudentEventPurchases,
  cachedCocCheck,
} from "@/lib/server/cached-queries";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminEvents } from "@/components/events/admin-events";
import { StudentEvents } from "@/components/events/student-events";
import { getSpecialEventRepo } from "@/lib/repositories";

export default async function EventsPage() {
  const user = await requireAuth();
  // Students always see the public catalog; staff need events:view.
  if (user.role !== "student") {
    await requirePermission("events:view");
  }
  await ensureOperationalDataHydrated();

  if (user.role === "student") {
    const [cocDone, events, myPurchases] = await Promise.all([
      cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version),
      cachedGetAllEvents(),
      cachedGetStudentEventPurchases(user.id),
    ]);
    if (!cocDone) redirect("/onboarding");
    const published = events.filter((e) => e.status === "published" && e.isVisible);
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
