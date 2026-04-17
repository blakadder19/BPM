"use server";

import { getAuthUser } from "@/lib/auth";
import { getDevStudentId } from "@/lib/actions/auth";
import {
  cachedGetNotifications,
  cachedGetStudentSubs,
  cachedGetStudentById,
} from "@/lib/server/cached-queries";
import { checkBirthdayBenefitEligibility } from "@/lib/domain/member-benefits";
import { birthdayBenefitAvailableEvent } from "@/lib/communications/builders";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import {
  dismissNotification,
  saveGenericNotificationToDB,
} from "@/lib/communications/notification-store";
import { buildMessage } from "@/lib/communications/messages";
import { getTodayStr } from "@/lib/domain/datetime";
import { isRealUser } from "@/lib/utils/is-real-user";
import { getNoticesForStudent } from "@/lib/services/class-cancellation-store";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { formatTime } from "@/lib/utils";
import type { AdminAlert } from "@/lib/domain/admin-alerts";

/**
 * Fetch student alerts/notifications as a server action.
 *
 * Moved off the layout critical path so the app shell renders immediately
 * and alerts populate asynchronously in the Topbar bell icon.
 */
export async function fetchStudentAlerts(): Promise<AdminAlert[]> {
  const user = await getAuthUser();
  if (!user || user.role !== "student") return [];

  await ensureOperationalDataHydrated();

  const isDev = process.env.NODE_ENV === "development";
  let devStudentId: string | undefined;
  if (isDev) {
    devStudentId = (await getDevStudentId()) ?? undefined;
  }

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
        if (
          n.type === "payment_pending" ||
          n.type === "renewal_prepared" ||
          n.type === "renewal_due_soon"
        ) {
          const subId = (n.payload as { subscriptionId?: string })
            .subscriptionId;
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
          const correctExpires =
            bdayEligibility.weekRange?.sunday ?? todayStr;
          const bp = n.payload as {
            expiresDate?: string;
            benefitDescription?: string;
          };
          const effectivePayload = {
            benefitDescription:
              bp.benefitDescription ??
              "Free class during your birthday week",
            expiresDate: correctExpires,
          };
          const msg = buildMessage(
            "birthday_benefit_available",
            effectivePayload
          );
          return [
            {
              id: n.id,
              severity: "info" as const,
              title: msg.title,
              message: msg.body,
              href: msg.href,
            },
          ];
        }

        if (n.type === "admin_broadcast") {
          const bp = n.payload as { title?: string; body?: string };
          const title = bp?.title || "Academy notice";
          const body = bp?.body || "You have a new notice from the academy.";
          return [
            {
              id: n.id,
              severity: "info" as const,
              title,
              message: body,
              href: "/dashboard",
            },
          ];
        }

        const msg = buildMessage(
          n.type as Exclude<typeof n.type, "birthday_benefit_available" | "admin_broadcast">,
          n.payload as never
        );
        return [
          {
            id: n.id,
            severity: (n.type === "class_cancelled" ? "warning" : "info") as
              | "warning"
              | "info",
            title: msg.title,
            message: msg.body,
            href: msg.href,
          },
        ];
      } catch {
        return [];
      }
    });

    if (bdayEligibility.currentlyActive && !birthdayNotifFound) {
      const expiresDate = bdayEligibility.weekRange?.sunday ?? todayStr;
      const event = birthdayBenefitAvailableEvent({
        studentId,
        studentName: studentProfile?.fullName ?? "",
        expiresDate,
        year,
      });
      saveGenericNotificationToDB(event).catch(() => {});
      const msg = buildMessage(
        "birthday_benefit_available",
        event.payload
      );
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
}
