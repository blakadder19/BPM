import { requireRole } from "@/lib/auth";
import { getTemplates } from "@/lib/services/class-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTeachers, buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { getSettings } from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import { AdminTemplates } from "@/components/classes/admin-templates";
import { ClassBrowser } from "@/components/booking/class-browser";

export default async function ClassesPage() {
  const user = await requireRole(["admin", "teacher", "student"]);

  if (user.role === "student") {
    return <ClassBrowser />;
  }

  const templates = getTemplates().map((t) => ({ ...t }));
  const teacherAssignments = getAssignments().map((a) => ({ ...a }));
  const allStyles = DANCE_STYLES.map((s) => ({ id: s.id, name: s.name }));
  const settings = getSettings();
  const nameMap = buildTeacherNameMap();
  const teacherNameMap = Object.fromEntries(nameMap);
  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminTemplates
      templates={templates}
      allStyles={allStyles}
      settings={{
        roleBalancedStyleNames: settings.roleBalancedStyleNames ?? [],
        socialsBookable: settings.socialsBookable,
        weeklyEventsBookable: settings.weeklyEventsBookable,
        studentPracticeBookable: settings.studentPracticeBookable,
      }}
      teacherAssignments={teacherAssignments}
      teacherNameMap={teacherNameMap}
      isDev={isDev}
    />
  );
}
