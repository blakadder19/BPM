import { requireRole } from "@/lib/auth";
import { listBroadcastsAction } from "@/lib/actions/broadcasts";
import { cachedGetAllStudents } from "@/lib/server/cached-queries";
import { BroadcastsClient } from "@/components/broadcasts/broadcasts-client";

export default async function BroadcastsPage() {
  await requireRole(["admin"]);

  const [broadcasts, students] = await Promise.all([
    listBroadcastsAction(),
    cachedGetAllStudents(),
  ]);

  const studentOptions = students
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, name: s.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <BroadcastsClient
      broadcasts={broadcasts}
      studentOptions={studentOptions}
    />
  );
}
