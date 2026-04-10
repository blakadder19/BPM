import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
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
  const _t0 = performance.now();
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();
  const _tHydrate = performance.now();

  const svc = getPenaltyRepo().getService();

  if (user.role === "student") {
    redirect("/dashboard");
  }

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

  const _tEnd = performance.now();
  console.info(`[perf /penalties] hydrate=${(_tHydrate-_t0).toFixed(0)}ms rest=${(_tEnd-_tHydrate).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

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
