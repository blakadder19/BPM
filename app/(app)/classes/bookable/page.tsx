import { requireRole } from "@/lib/auth";
import { getInstances } from "@/lib/services/schedule-store";
import { getTemplates } from "@/lib/services/class-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTeachers, buildTeacherNameMap, getInactiveTeacherIds } from "@/lib/services/teacher-roster-store";
import { getPresets } from "@/lib/services/pair-preset-store";
import { getSettings } from "@/lib/services/settings-store";
import { getTermRepo } from "@/lib/repositories";
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
  const inactiveTeacherIds = Array.from(getInactiveTeacherIds());
  const settings = getSettings();
  const isDev = process.env.NODE_ENV === "development";

  const allStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));
  const terms = await getTermRepo().getAll();
  const allTerms = terms.map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate }));

  return (
    <AdminSchedule
      instances={instances}
      templates={templates}
      allStyles={allStyles}
      allTerms={allTerms}
      settings={{
        roleBalancedStyleNames: settings.roleBalancedStyleNames ?? [],
        socialsBookable: settings.socialsBookable,
        weeklyEventsBookable: settings.weeklyEventsBookable,
        studentPracticeBookable: settings.studentPracticeBookable,
      }}
      teacherAssignments={teacherAssignments}
      teacherRoster={teacherRoster}
      teacherNameMap={teacherNameMap}
      inactiveTeacherIds={inactiveTeacherIds}
      pairPresets={pairPresets}
      isDev={isDev}
      initialSearch={params.search ?? ""}
    />
  );
}
