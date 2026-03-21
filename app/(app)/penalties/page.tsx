import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPenaltyRepo, getStudentRepo, getSettingsRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getTemplates } from "@/lib/services/class-store";
import { AdminPenalties } from "@/components/penalties/admin-penalties";
import {
  StudentPenalties,
  type StudentPenaltyView,
} from "@/components/penalties/student-penalties";

export default async function PenaltiesPage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string; student?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();

  const svc = getPenaltyRepo().getService();

  if (user.role === "student") {
    const mine: StudentPenaltyView[] = svc.penalties
      .filter((p) => p.studentId === user.id && p.resolution !== "attendance_corrected")
      .map((p) => ({
        id: p.id,
        classTitle: p.classTitle,
        date: p.classDate,
        reason: p.reason,
        amountCents: p.amountCents,
        resolution: p.resolution,
        createdAt: p.createdAt,
      }));

    return <StudentPenalties penalties={mine} />;
  }

  const allPenalties = svc.getAllPenalties();
  const settings = await getSettingsRepo().get();

  const allStudents = await getStudentRepo().getAll();
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
