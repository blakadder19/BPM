import type { Metadata } from "next";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { cachedGetTerms } from "@/lib/server/cached-queries";
import { isClassInFuture, getTodayStr } from "@/lib/domain/datetime";
import { getCurrentTerm, getNextTerm } from "@/lib/domain/term-rules";
import { getBookingRepo } from "@/lib/repositories";
import { GuestClassBrowser, type GuestClassData } from "@/components/booking/guest-class-browser";

export const metadata: Metadata = {
  title: "Explore Classes — BPM",
  description: "Browse the Balance Power Motion class schedule",
};

export default async function ExplorePage() {
  await ensureOperationalDataHydrated();

  const [terms] = await Promise.all([cachedGetTerms()]);

  const instances = getInstances();
  const danceStyles = getDanceStyles();
  const styleByName = new Map(danceStyles.map((s) => [s.name, s]));

  const svc = getBookingRepo().getService();
  svc.refreshClasses(
    instances.map((bc) => {
      const style = bc.styleName ? styleByName.get(bc.styleName) : null;
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

  const confirmedByClass = new Map<string, number>();
  for (const b of svc.bookings) {
    if (b.status !== "confirmed" && b.status !== "checked_in") continue;
    confirmedByClass.set(b.bookableClassId, (confirmedByClass.get(b.bookableClassId) ?? 0) + 1);
  }

  const todayStr = getTodayStr();

  const futureInstances = instances
    .filter((c) => isClassInFuture(c.date, c.startTime))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const guestClasses: GuestClassData[] = futureInstances.map((c) => {
    const style = c.styleName ? styleByName.get(c.styleName) : null;
    return {
      id: c.id,
      title: c.title,
      classType: c.classType,
      styleName: c.styleName,
      level: c.level,
      date: c.date,
      startTime: c.startTime,
      endTime: c.endTime,
      location: c.location,
      maxCapacity: c.maxCapacity,
      totalBooked: confirmedByClass.get(c.id) ?? 0,
      danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
    };
  });

  const currentTerm = getCurrentTerm(terms, todayStr);
  const nextTerm = getNextTerm(terms, todayStr);
  const termInfo = currentTerm
    ? { name: currentTerm.name ?? "Current Term", startDate: currentTerm.startDate, endDate: currentTerm.endDate }
    : nextTerm
      ? { name: nextTerm.name ?? "Next Term", startDate: nextTerm.startDate, endDate: nextTerm.endDate }
      : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <GuestClassBrowser
        classes={guestClasses}
        today={todayStr}
        termInfo={termInfo}
      />
    </div>
  );
}
