import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import { getInstances } from "@/lib/services/schedule-store";
import { getTemplates } from "@/lib/services/class-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTeachers, buildTeacherNameMap, getInactiveTeacherIds } from "@/lib/services/teacher-roster-store";
import { getPresets } from "@/lib/services/pair-preset-store";
import { getSettings } from "@/lib/services/settings-store";
import { getTermRepo } from "@/lib/repositories";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { getTodayStr } from "@/lib/domain/datetime";
import { AdminSchedule } from "@/components/classes/admin-schedule";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getBookingService } from "@/lib/services/booking-store";

export default async function BookableClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; date?: string }>;
}) {
  await requirePermission("classes:view");
  await ensureScheduleBootstrapped();
  await ensureOperationalDataHydrated();
  const params = searchParams ? await searchParams : {};

  const svc = getBookingService();
  const instances = getInstances().map((bc) => ({
    ...bc,
    bookedCount: svc.getConfirmedBookingsForClass(bc.id).length,
    waitlistCount: svc.waitlist.filter((w) => w.bookableClassId === bc.id && w.status === "waiting").length,
  }));
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

  const access = await getStaffAccess();
  const permissions = {
    canCreate: hasPermission(access, "classes:create"),
    canEdit: hasPermission(access, "classes:edit"),
    canCancel: hasPermission(access, "classes:cancel"),
    canDelete: hasPermission(access, "classes:delete"),
    canAssignTeachers: hasPermission(access, "teachers:edit"),
  };

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
      initialDate={params.date ?? ""}
      today={getTodayStr()}
      permissions={permissions}
    />
  );
}
