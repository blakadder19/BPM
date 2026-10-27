import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import {
  cachedGetAllEvents,
  cachedGetStudentEventPurchases,
  cachedCocCheck,
} from "@/lib/server/cached-queries";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { ensurePageDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminEvents } from "@/components/events/admin-events";
import { StudentEvents } from "@/components/events/student-events";
import { getSpecialEventRepo } from "@/lib/repositories";
import { shouldShowEventInPublicList } from "@/lib/domain/event-visibility";

export default async function EventsPage() {
  const user = await requireAuth();
  // Students always see the public catalog; staff need events:view.
  if (user.role !== "student") {
    await requirePermission("events:view");
  }
  await ensurePageDataHydrated();

  if (user.role === "student") {
    const [cocDone, events, myPurchases] = await Promise.all([
      cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version),
      cachedGetAllEvents(),
      cachedGetStudentEventPurchases(user.id),
    ]);
    if (!cocDone) redirect("/onboarding");
    // Phase 4: archived events are invisible to students even if the
    // underlying purchase still exists. shouldShowEventInPublicList()
    // bundles status / isVisible / archivedAt into one predicate.
    const published = events.filter(shouldShowEventInPublicList);
    return <StudentEvents events={published} purchases={myPurchases} />;
  }

  const events = await cachedGetAllEvents();
  const access = await getStaffAccess();
  const permissions = {
    canCreate: hasPermission(access, "events:create"),
    canEdit: hasPermission(access, "events:edit"),
    canDelete: hasPermission(access, "events:delete"),
    canMarkPaid: hasPermission(access, "events:mark_paid"),
  };

  const repo = getSpecialEventRepo();
  const eventIds = events.map((evt) => evt.id);
  const [sessionCountMap, productCountMap] = await Promise.all([
    repo.countSessionsByEvent(eventIds),
    repo.countProductsByEvent(eventIds),
  ]);

  return (
    <AdminEvents
      events={events}
      sessionCountMap={sessionCountMap}
      productCountMap={productCountMap}
      permissions={permissions}
    />
  );
}
