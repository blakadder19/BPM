import { requireSuperAdmin } from "@/lib/staff-permissions";
import { listBroadcastsAction } from "@/lib/actions/broadcasts";
import {
  cachedGetAllStudents,
  cachedGetProducts,
  cachedGetAllEvents,
} from "@/lib/server/cached-queries";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getTemplates } from "@/lib/services/class-store";
import { BroadcastsClient } from "@/components/broadcasts/broadcasts-client";

export default async function BroadcastsPage() {
  await requireSuperAdmin();

  const [broadcasts, students, products, events] = await Promise.all([
    listBroadcastsAction(),
    cachedGetAllStudents(),
    cachedGetProducts(),
    cachedGetAllEvents(),
    ensureOperationalDataHydrated(),
  ]);

  const studentOptions = students
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, name: s.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const productOptions = products
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // CTA target list: only events a student could actually open.
  const eventOptions = events
    .filter((e) => e.status === "published" && e.isVisible)
    .map((e) => ({ id: e.id, name: e.title }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Phase 17 — audience list for "Event ticket holders". Deliberately
  // BROADER than the CTA list: the headline use case is emailing
  // holders of a CANCELLED or newly hidden event, so filtering to
  // published + visible would exclude exactly the events that need a
  // broadcast most. Sorted newest-first because the event being
  // communicated about is almost always a recent one, and the date is
  // included so similarly named events can be told apart.
  const ticketHolderEventOptions = events
    .map((e) => ({
      id: e.id,
      name: e.title,
      date: e.startDate ?? null,
      status: e.status,
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name));

  const classTemplates = getTemplates();
  const classOptions = classTemplates
    .filter((c) => c.isActive && c.classType === "class")
    .map((c) => ({
      id: c.id,
      name: [c.title, c.styleName, c.level].filter(Boolean).join(" — "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <BroadcastsClient
      broadcasts={broadcasts}
      studentOptions={studentOptions}
      productOptions={productOptions}
      eventOptions={eventOptions}
      ticketHolderEventOptions={ticketHolderEventOptions}
      classOptions={classOptions}
    />
  );
}
