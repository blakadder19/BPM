import { requireRole } from "@/lib/auth";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTemplates } from "@/lib/services/class-store";
import { getInstances } from "@/lib/services/schedule-store";
import { getTeachers, buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { AdminTeachers } from "@/components/classes/admin-teachers";

export default async function TeacherPairsPage() {
  await requireRole(["admin", "teacher"]);
  await ensureScheduleBootstrapped();

  const teacherRoster = getTeachers().map((t) => ({ ...t }));
  const assignments = getAssignments().map((a) => ({ ...a }));
  const templates = getTemplates().map((t) => ({ ...t }));
  const scheduleInstances = getInstances().map((i) => ({ ...i }));
  const nameMap = buildTeacherNameMap();
  const teacherNameMap = Object.fromEntries(nameMap);
  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminTeachers
      teacherRoster={teacherRoster}
      assignments={assignments}
      templates={templates}
      teacherNameMap={teacherNameMap}
      scheduleInstances={scheduleInstances}
      isDev={isDev}
    />
  );
}
