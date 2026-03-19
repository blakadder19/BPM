import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSettings } from "@/lib/services/settings-store";
import { STUDENTS, CLASSES } from "@/lib/mock-data";
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

  const svc = getPenaltyService();

  if (user.role === "student") {
    const mine: StudentPenaltyView[] = svc.penalties
      .filter((p) => p.studentName === user.fullName && p.resolution !== "attendance_corrected")
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

  const all = svc.getAllPenalties();
  const settings = getSettings();

  const studentOptions = STUDENTS.map((s) => ({ id: s.id, fullName: s.fullName }));
  const classOptions = CLASSES
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
