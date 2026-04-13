import { requireRole } from "@/lib/auth";
import { getPenaltyRepo, getSettingsRepo } from "@/lib/repositories";
import { cachedGetAllStudents } from "@/lib/server/cached-queries";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getTemplates } from "@/lib/services/class-store";
import { AdminPenalties } from "@/components/penalties/admin-penalties";


export default async function PenaltiesPage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string; student?: string }>;
}) {
  await requireRole(["admin"]);
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();

  const svc = getPenaltyRepo().getService();

  const allPenalties = svc.getAllPenalties();

  const [settings, allStudents] = await Promise.all([
    getSettingsRepo().get(),
    cachedGetAllStudents(),
  ]);
  const studentIds = new Set(allStudents.map((s) => s.id));
  const studentOptions = allStudents.map((s) => ({ id: s.id, fullName: s.fullName }));

  const all = allPenalties.filter((p) => studentIds.has(p.studentId));
  const classOptions = getTemplates()
    .filter((c) => c.classType === "class")
    .map((c) => ({ id: c.id, title: c.title }));

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminPenalties
      penalties={all}
      students={studentOptions}
      classes={classOptions}
      penaltyFees={{
        lateCancelCents: settings.lateCancelFeeCents,
        noShowCents: settings.noShowFeeCents,
      }}
      isDev={isDev}
      initialSearch={params.classTitle ?? ""}
      initialStudentFilter={params.student ?? ""}
    />
  );
}
