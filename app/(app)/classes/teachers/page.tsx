import { requireRole } from "@/lib/auth";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTemplates } from "@/lib/services/class-store";
import { getTeachers, buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { AdminTeachers } from "@/components/classes/admin-teachers";

export default async function TeacherPairsPage() {
  await requireRole(["admin", "teacher"]);

  const teacherRoster = getTeachers().map((t) => ({ ...t }));
  const assignments = getAssignments().map((a) => ({ ...a }));
  const templates = getTemplates().map((t) => ({ ...t }));
  const nameMap = buildTeacherNameMap();
  const teacherNameMap = Object.fromEntries(nameMap);
  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminTeachers
      teacherRoster={teacherRoster}
      assignments={assignments}
      templates={templates}
      teacherNameMap={teacherNameMap}
      isDev={isDev}
    />
  );
}
