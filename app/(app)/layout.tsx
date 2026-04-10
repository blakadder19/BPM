import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getDevStudentId } from "@/lib/actions/auth";
import { cachedGetTerms, cachedGetStudentSubs, cachedGetNotifications, cachedGetAllStudents, cachedGetStudentById } from "@/lib/server/cached-queries";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserProvider } from "@/components/providers/user-provider";
import { SidebarProvider } from "@/components/providers/sidebar-provider";
import { DevPanelGate } from "@/components/dev/dev-panel-gate";
import { SessionGuard } from "@/components/layout/session-guard";
import { computeAdminAlerts, type AdminAlert } from "@/lib/domain/admin-alerts";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { getTodayStr } from "@/lib/domain/datetime";
import { getSettings } from "@/lib/services/settings-store";
import { getNoticesForStudent } from "@/lib/services/class-cancellation-store";
import { dismissNotification, saveGenericNotificationToDB } from "@/lib/communications/notification-store";
import { buildMessage } from "@/lib/communications/messages";
import { checkBirthdayBenefitEligibility } from "@/lib/domain/member-benefits";
import { birthdayBenefitAvailableEvent } from "@/lib/communications/builders";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { isRealUser } from "@/lib/utils/is-real-user";
import { formatTime } from "@/lib/utils";

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

    if (user.role === "student") {
      try {
        const studentId = devStudentId ?? user.id;
        if (isRealUser(studentId)) {
          const todayStr = getTodayStr();
          const year = new Date().getFullYear();

          const [stored, studentSubs, studentProfile, bdayUsed] = await Promise.all([
            cachedGetNotifications(studentId),
            cachedGetStudentSubs(studentId),
            cachedGetStudentById(studentId),
            isBirthdayClassUsed(studentId, year),
          ]);
          const activeSubIds = new Set(studentSubs.map((s) => s.id));

          const bdayEligibility = checkBirthdayBenefitEligibility({
            subscriptions: studentSubs,
            dateOfBirth: studentProfile?.dateOfBirth ?? null,
            referenceDate: todayStr,
            alreadyUsedThisYear: bdayUsed,
          });

          const staleIds: string[] = [];
          let birthdayNotifFound = false;

          const result = stored.flatMap((n) => {
            try {
              if (n.type === "payment_pending" || n.type === "renewal_prepared" || n.type === "renewal_due_soon") {
                const subId = (n.payload as { subscriptionId?: string }).subscriptionId;
                if (subId && !activeSubIds.has(subId)) {
                  staleIds.push(n.id);
                  return [];
                }
                if (subId) {
                  const sub = studentSubs.find((s) => s.id === subId);
                  if (sub && sub.paymentStatus === "paid") {
                    staleIds.push(n.id);
                    return [];
                  }
                }
              }

              if (n.type === "birthday_benefit_available") {
                birthdayNotifFound = true;
                if (!bdayEligibility.currentlyActive) {
                  return [];
                }
                const correctExpires = bdayEligibility.weekRange?.sunday ?? todayStr;
                const bp = n.payload as { expiresDate?: string; benefitDescription?: string };
                const effectivePayload = {
                  benefitDescription: bp.benefitDescription ?? "Free class during your birthday week",
                  expiresDate: correctExpires,
                };
                const msg = buildMessage("birthday_benefit_available", effectivePayload);
                return [{
                  id: n.id,
                  severity: "info" as const,
                  title: msg.title,
                  message: msg.body,
                  href: msg.href,
                }];
              }

              // birthday_benefit_available is handled above; remaining types are safe
              const msg = buildMessage(
                n.type as Exclude<typeof n.type, "birthday_benefit_available">,
                n.payload as never
              );
              return [{
                id: n.id,
                severity: (n.type === "class_cancelled" ? "warning" : "info") as "warning" | "info",
                title: msg.title,
                message: msg.body,
                href: msg.href,
              }];
            } catch {
              return [];
            }
          });

          // If eligible but no birthday notification exists in DB, create one
          // (DB-only, no email — email was sent on initial dispatch via dashboard)
          if (bdayEligibility.currentlyActive && !birthdayNotifFound) {
            const expiresDate = bdayEligibility.weekRange?.sunday ?? todayStr;
            const event = birthdayBenefitAvailableEvent({
              studentId,
              studentName: studentProfile?.fullName ?? "",
              expiresDate,
              year,
            });
            saveGenericNotificationToDB(event).catch(() => {});
            const msg = buildMessage("birthday_benefit_available", event.payload);
            result.push({
              id: event.id,
              severity: "info" as const,
              title: msg.title,
              message: msg.body,
              href: msg.href,
            });
          }

          for (const id of staleIds) {
            dismissNotification(id).catch(() => {});
          }
          return result;
        } else {
          const notices = getNoticesForStudent(studentId);
          return notices.map((n) => ({
            id: n.id,
            severity: "warning" as const,
            title: "Class cancelled",
            message: `"${n.classTitle}" on ${n.classDate} at ${formatTime(n.startTime)} was cancelled by the academy.${n.creditReverted ? " Your credit has been returned." : ""}`,
            href: "/bookings",
          }));
        }
      } catch {
        return [];
      }
    }
    return [];
  })();

  const [devStudents, alerts] = await Promise.all([devStudentsPromise, alertsPromise]);

  const _ltEnd = performance.now();
  console.info(`[perf layout] auth=${(_ltAuth-_lt0).toFixed(0)}ms alerts=${(_ltEnd-_ltAuth).toFixed(0)}ms total=${(_ltEnd-_lt0).toFixed(0)}ms`);
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
          <main className="flex-1 overflow-y-auto overscroll-y-contain [&]:[-webkit-overflow-scrolling:touch] px-4 py-4 md:p-6">
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
    </SidebarProvider>
  );
}
