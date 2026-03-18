import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { AdminPenalties } from "@/components/penalties/admin-penalties";
import {
  StudentPenalties,
  type StudentPenaltyView,
} from "@/components/penalties/student-penalties";

export default async function PenaltiesPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const svc = getPenaltyService();

  if (user.role === "student") {
    const mine: StudentPenaltyView[] = svc.penalties
      .filter((p) => p.studentName === user.fullName)
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

  return <AdminPenalties penalties={all} />;
}
