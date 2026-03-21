import { requireRole } from "@/lib/auth";
import { getInstances } from "@/lib/services/schedule-store";
import { getTemplates } from "@/lib/services/class-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTeachers, buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { getPresets } from "@/lib/services/pair-preset-store";
import { getSettings } from "@/lib/services/settings-store";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { AdminSchedule } from "@/components/classes/admin-schedule";

export default async function BookableClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  await requireRole(["admin", "teacher"]);
  await ensureScheduleBootstrapped();
  const params = searchParams ? await searchParams : {};

  const instances = getInstances().map((bc) => ({ ...bc }));
  const templates = getTemplates().map((t) => ({ ...t }));
  const teacherAssignments = getAssignments().map((a) => ({ ...a }));
  const teacherRoster = getTeachers().map((t) => ({ ...t }));
  const pairPresets = getPresets().map((p) => ({ ...p }));
  const nameMap = buildTeacherNameMap();
  const teacherNameMap = Object.fromEntries(nameMap);
  const settings = getSettings();
  const isDev = process.env.NODE_ENV === "development";

  const allStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));

  return (
    <AdminSchedule
      instances={instances}
      templates={templates}
      allStyles={allStyles}
      settings={{
        roleBalancedStyleNames: settings.roleBalancedStyleNames ?? [],
        socialsBookable: settings.socialsBookable,
        weeklyEventsBookable: settings.weeklyEventsBookable,
        studentPracticeBookable: settings.studentPracticeBookable,
      }}
      teacherAssignments={teacherAssignments}
      teacherRoster={teacherRoster}
      teacherNameMap={teacherNameMap}
      pairPresets={pairPresets}
      isDev={isDev}
      initialSearch={params.search ?? ""}
    />
  );
}
