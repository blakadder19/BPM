import "server-only";

import { getSpecialEventRepo, getStudentRepo, getSubscriptionRepo } from "@/lib/repositories";
import { hasConfiguredVatNumber } from "@/lib/domain/receipt-settings";
import {
  buildReceiptData,
  type ReceiptCustomer,
  type ReceiptData,
  type ReceiptSourceType,
} from "@/lib/domain/receipts";
import { loadReceiptBusinessSettings } from "@/lib/services/student-receipts";

/**
 * Any purchase's receipt, for staff holding `payments:send_receipt`. The
 * caller checks the permission; this only loads and builds. Unknown,
 * malformed and ineligible ids all return null.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function studentCustomer(studentId: string): Promise<ReceiptCustomer | null> {
  const student = await getStudentRepo().getById(studentId);
  return student ? { name: student.fullName, email: student.email } : null;
}

export async function getStaffReceipt(sourceType: ReceiptSourceType, id: string): Promise<ReceiptData | null> {
  if (!UUID_RE.test(id)) return null;
  const ctx = { businessHasVatNumber: hasConfiguredVatNumber(await loadReceiptBusinessSettings()) };

  switch (sourceType) {
    case "subscription": {
      const row = await getSubscriptionRepo().getById(id);
      if (!row) return null;
      const customer = await studentCustomer(row.studentId);
      if (!customer) return null;
      const built = buildReceiptData({ kind: "subscription", row, customer }, ctx);
      return built.ok ? built.receipt : null;
    }
    case "event_purchase": {
      const row = await getSpecialEventRepo().getPurchaseById(id);
      if (!row) return null;
      const customer = row.studentId ? await studentCustomer(row.studentId) : null;
      if (row.studentId && !customer) return null;
      const built = buildReceiptData({ kind: "event_purchase", row, customer }, ctx);
      return built.ok ? built.receipt : null;
    }
    default: {
      const unreachable: never = sourceType;
      void unreachable;
      return null;
    }
  }
}
