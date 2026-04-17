import { requireRole } from "@/lib/auth";
import { listBroadcastsAction } from "@/lib/actions/broadcasts";
import {
  cachedGetAllStudents,
  cachedGetProducts,
  cachedGetAllEvents,
} from "@/lib/server/cached-queries";
import { BroadcastsClient } from "@/components/broadcasts/broadcasts-client";

export default async function BroadcastsPage() {
  await requireRole(["admin"]);

  const [broadcasts, students, products, events] = await Promise.all([
    listBroadcastsAction(),
    cachedGetAllStudents(),
    cachedGetProducts(),
    cachedGetAllEvents(),
  ]);

  const studentOptions = students
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, name: s.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const productOptions = products
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const eventOptions = events
    .filter((e) => e.status === "published" && e.isVisible)
    .map((e) => ({ id: e.id, name: e.title }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <BroadcastsClient
      broadcasts={broadcasts}
      studentOptions={studentOptions}
      productOptions={productOptions}
      eventOptions={eventOptions}
    />
  );
}
