import "server-only";

import type { AuthUser } from "@/lib/auth";
import { isMemoryMode } from "@/lib/config/data-provider";
import { getSpecialEventRepo, getSubscriptionRepo } from "@/lib/repositories";
import { getAcademyName } from "@/lib/supabase/academy";
import { getReceiptBusinessSettings, hydrateSettings } from "@/lib/services/settings-store";
import {
  buildReceiptData,
  type ReceiptCustomer,
  type ReceiptData,
  type ReceiptSourceType,
} from "@/lib/domain/receipts";
import { hasConfiguredVatNumber, resolveReceiptIssuer, type ReceiptIssuer } from "@/lib/domain/receipt-settings";
import { sortPaymentHistory, toPaymentHistoryItem, type PaymentHistoryItem } from "@/lib/domain/payment-history";

/**
 * Receipts for the signed-in student's own purchases.
 *
 * Ownership is checked against the session before anything else, and
 * every "no" — not a student, someone else's purchase, no such purchase,
 * not eligible — returns the same `null`, so callers cannot tell them
 * apart and neither can the client.
 */

export type ReceiptViewer = Pick<AuthUser, "id" | "role" | "fullName" | "email">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function studentCustomer(viewer: ReceiptViewer): ReceiptCustomer {
  return { name: viewer.fullName, email: viewer.email };
}

export async function loadReceiptBusinessSettings() {
  await hydrateSettings();
  return getReceiptBusinessSettings();
}

export async function loadReceiptIssuer(): Promise<ReceiptIssuer> {
  const settings = await loadReceiptBusinessSettings();
  const fallbackName = isMemoryMode() ? null : await getAcademyName().catch(() => null);
  return resolveReceiptIssuer(settings, fallbackName);
}

export async function getOwnedStudentReceipt(
  viewer: ReceiptViewer,
  sourceType: ReceiptSourceType,
  id: string,
): Promise<ReceiptData | null> {
  if (viewer.role !== "student" || !UUID_RE.test(id)) return null;
  const ctx = { businessHasVatNumber: hasConfiguredVatNumber(await loadReceiptBusinessSettings()) };

  switch (sourceType) {
    case "subscription": {
      const row = await getSubscriptionRepo().getById(id);
      if (!row || row.studentId !== viewer.id) return null;
      const built = buildReceiptData({ kind: "subscription", row, customer: studentCustomer(viewer) }, ctx);
      return built.ok ? built.receipt : null;
    }
    case "event_purchase": {
      const row = await getSpecialEventRepo().getPurchaseById(id);
      if (!row || !row.studentId || row.studentId !== viewer.id) return null;
      const built = buildReceiptData({ kind: "event_purchase", row, customer: studentCustomer(viewer) }, ctx);
      return built.ok ? built.receipt : null;
    }
    default: {
      const unreachable: never = sourceType;
      void unreachable;
      return null;
    }
  }
}

/** The student's subscriptions and event purchases, newest first. Queries only their rows. */
export async function listStudentPaymentHistory(viewer: ReceiptViewer): Promise<PaymentHistoryItem[]> {
  if (viewer.role !== "student") return [];
  const eventRepo = getSpecialEventRepo();
  const [settings, subscriptions, purchases] = await Promise.all([
    loadReceiptBusinessSettings(),
    getSubscriptionRepo().getByStudent(viewer.id),
    eventRepo.getPurchasesByStudent(viewer.id),
  ]);
  const ctx = { businessHasVatNumber: hasConfiguredVatNumber(settings) };
  const customer = studentCustomer(viewer);

  // Display-only titles for purchases recorded before the event title was frozen.
  const untitledEventIds = [...new Set(purchases.filter((p) => !p.eventTitleSnapshot?.trim()).map((p) => p.eventId))];
  const liveTitles = new Map<string, string>();
  await Promise.all(
    untitledEventIds.map(async (eventId) => {
      const event = await eventRepo.getEventById(eventId).catch(() => null);
      if (event?.title) liveTitles.set(eventId, event.title);
    }),
  );

  const items: PaymentHistoryItem[] = [
    ...subscriptions
      .filter((row) => row.studentId === viewer.id)
      .map((row) => toPaymentHistoryItem({ kind: "subscription", row, customer }, { ctx })),
    ...purchases
      .filter((row) => row.studentId === viewer.id)
      .map((row) =>
        toPaymentHistoryItem(
          { kind: "event_purchase", row, customer },
          { ctx, liveEventTitle: liveTitles.get(row.eventId) ?? null },
        ),
      ),
  ];
  return sortPaymentHistory(items);
}
