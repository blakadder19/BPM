import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getDevStudentId } from "@/lib/actions/auth";
import { getStudentRepo, getTermRepo } from "@/lib/repositories";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserProvider } from "@/components/providers/user-provider";
import { DevPanelGate } from "@/components/dev/dev-panel-gate";
import { SessionGuard } from "@/components/layout/session-guard";
import { computeAdminAlerts, type AdminAlert } from "@/lib/domain/admin-alerts";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { getInstances } from "@/lib/services/schedule-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTodayStr } from "@/lib/domain/datetime";
import { getSettings } from "@/lib/services/settings-store";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  // Hard-guard: unconfirmed email → send back to confirmation waiting screen.
  if (!user.emailConfirmed) {
    redirect("/signup?awaiting=1");
  }

  const isDev = process.env.NODE_ENV === "development";

  // Prepare dev data only in development (cheap data prep — actual visibility
  // is gated client-side by the useDevUnlock hook in Topbar and DevPanelGate).
  let devStudents: { id: string; fullName: string }[] | undefined;
  let devStudentId: string | undefined;
  if (isDev) {
    const allStudents = await getStudentRepo().getAll();
    devStudents = allStudents.map((s) => ({ id: s.id, fullName: s.fullName }));
    devStudentId = (await getDevStudentId()) ?? undefined;
  }

  let adminAlerts: AdminAlert[] = [];
  if (user.role === "admin") {
    try {
      await ensureScheduleBootstrapped();
      const terms = await getTermRepo().getAll();
      const settings = getSettings();
      adminAlerts = computeAdminAlerts({
        terms,
        instances: getInstances(),
        teacherAssignments: getAssignments(),
        today: getTodayStr(),
        disabledAlertIds: settings.disabledAlertIds,
      });
    } catch {
      // Alert computation is best-effort — never block the layout
    }
  }

  const panelStudentId = devStudentId ?? user.id;
  const panelStudentName = devStudentId
    ? devStudents?.find((s) => s.id === devStudentId)?.fullName ?? user.fullName
    : user.fullName;

  return (
    <div className="flex h-screen bg-gray-50">
      <SessionGuard />
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          user={user}
          alerts={adminAlerts}
          devStudents={devStudents}
          devStudentId={devStudentId}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <UserProvider
            user={{ role: user.role, fullName: user.fullName, email: user.email }}
          >
            {children}
          </UserProvider>
        </main>
      </div>
      {isDev && (
        <DevPanelGate studentId={panelStudentId} studentName={panelStudentName} />
      )}
    </div>
  );
}
