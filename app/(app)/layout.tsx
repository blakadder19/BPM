import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getDevStudentId } from "@/lib/actions/auth";
import { cachedGetTerms, cachedGetAllStudents } from "@/lib/server/cached-queries";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserProvider } from "@/components/providers/user-provider";
import { SidebarProvider } from "@/components/providers/sidebar-provider";
import { DevPanelGate } from "@/components/dev/dev-panel-gate";
import { SessionGuard } from "@/components/layout/session-guard";
import { GlobalScanReceiver } from "@/components/scan/global-scan-receiver";
import { computeAdminAlerts, type AdminAlert } from "@/lib/domain/admin-alerts";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTodayStr } from "@/lib/domain/datetime";
import { getSettings } from "@/lib/services/settings-store";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const _lt0 = performance.now();
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }
  const _ltAuth = performance.now();

  // Hard-guard: unconfirmed email → send back to confirmation waiting screen.
  if (!user.emailConfirmed) {
    redirect("/signup?awaiting=1");
  }

  // Kick off hydration immediately — pages that await it will join the
  // already-running promise instead of starting a new one.  This moves
  // the cold-start cost earlier so it overlaps with alert/notification work.
  void ensureOperationalDataHydrated();

  const isDev = process.env.NODE_ENV === "development";

  // Get dev student ID early (just a cookie read, <1ms) so alert fetch can start sooner
  let devStudentId: string | undefined;
  if (isDev) {
    devStudentId = (await getDevStudentId()) ?? undefined;
  }

  // Run dev student list loading AND role-specific alerts in parallel
  const devStudentsPromise = isDev
    ? cachedGetAllStudents().then((ss) => ss.map((s) => ({ id: s.id, fullName: s.fullName })))
    : Promise.resolve(undefined);

  // Student alerts are fetched client-side in the Topbar to avoid blocking
  // the layout render (~200ms of Supabase queries per navigation).
  // Admin alerts are fast (local computation), so they stay server-side.
  const alertsPromise = (async (): Promise<AdminAlert[]> => {
    if (user.role === "admin") {
      try {
        await ensureScheduleBootstrapped();
        const terms = await cachedGetTerms();
        const settings = getSettings();
        return computeAdminAlerts({
          terms,
          instances: getInstances(),
          teacherAssignments: getAssignments(),
          today: getTodayStr(),
          disabledAlertIds: settings.disabledAlertIds,
        });
      } catch {
        return [];
      }
    }
    return [];
  })();

  const [devStudents, alerts] = await Promise.all([devStudentsPromise, alertsPromise]);

  const _ltEnd = performance.now();
  if (isDev) console.info(`[perf layout] auth=${(_ltAuth-_lt0).toFixed(0)}ms alerts=${(_ltEnd-_ltAuth).toFixed(0)}ms total=${(_ltEnd-_lt0).toFixed(0)}ms`);
  const panelStudentId = devStudentId ?? user.id;
  const panelStudentName = devStudentId
    ? devStudents?.find((s) => s.id === devStudentId)?.fullName ?? user.fullName
    : user.fullName;

  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] bg-gray-50">
        <SessionGuard />
        <Sidebar user={user} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            user={user}
            alerts={alerts}
            devStudents={devStudents}
            devStudentId={devStudentId}
          />
          <main data-main-scroll className="flex-1 overflow-y-auto overscroll-y-contain [&]:[-webkit-overflow-scrolling:touch] px-4 py-4 md:p-6">
            <UserProvider
              user={{ role: user.role, fullName: user.fullName, email: user.email }}
            >
              {children}
              {(user.role === "admin" || user.role === "teacher") && (
                <GlobalScanReceiver userId={user.id} />
              )}
            </UserProvider>
          </main>
        </div>
        {isDev && (
          <DevPanelGate studentId={panelStudentId} studentName={panelStudentName} />
        )}
      </div>
    </SidebarProvider>
  );
}
