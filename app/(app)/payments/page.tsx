import { Receipt } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listStudentPaymentHistory } from "@/lib/services/student-receipts";
import { formatReceiptDate, formatReceiptMoney } from "@/lib/domain/receipt-format";
import type { PaymentHistoryItem, PaymentReceiptAction } from "@/lib/domain/payment-history";

export const dynamic = "force-dynamic";

type BadgeVariant = "success" | "warning" | "danger" | "muted" | "neutral";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  paid: "success",
  pending: "warning",
  refunded: "neutral",
  cancelled: "danger",
  complimentary: "muted",
  waived: "muted",
};

function amountLabel(item: PaymentHistoryItem): string {
  if (item.amountCents == null || !item.currency) return "—";
  return formatReceiptMoney(item.amountCents, item.currency);
}

function ReceiptAction({ action }: { action: PaymentReceiptAction }) {
  switch (action.kind) {
    case "download":
      return (
        <a href={action.href} className="text-sm font-medium text-bpm-600 hover:text-bpm-700 whitespace-nowrap">
          Download receipt
        </a>
      );
    case "no_payment":
      return (
        <span className="text-sm text-gray-500">
          <span aria-hidden>—</span> <span className="text-xs">{action.label}</span>
        </span>
      );
    case "awaiting_payment":
      return <span className="text-xs text-gray-500">Available once paid</span>;
    case "unavailable":
      return <span className="text-xs text-gray-500">Not available — contact BPM if you need one</span>;
    default: {
      const unreachable: never = action;
      void unreachable;
      return null;
    }
  }
}

function ItemCell({ item }: { item: PaymentHistoryItem }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-gray-900">{item.secondaryLabel ?? item.itemName}</p>
      {item.secondaryLabel && <p className="text-xs text-gray-500">{item.itemName}</p>}
    </div>
  );
}

export default async function PaymentsPage() {
  const user = await requireRole(["student"]);
  const items = await listStudentPaymentHistory(user);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments & receipts"
        description="Your class entitlements and event purchases. Download a receipt for any payment BPM has recorded."
      />

      {items.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments yet" description="Purchases you make will appear here." />
      ) : (
        <>
          {/* Desktop */}
          <Card className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Refund</th>
                  <th className="px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.key} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {item.recordedAt ? formatReceiptDate(item.recordedAt) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ItemCell item={item} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.typeLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{amountLabel(item)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[item.paymentStatus] ?? "muted"}>{item.paymentStatusLabel}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.refundLabel ?? "—"}</td>
                    <td className="px-4 py-3">
                      <ReceiptAction action={item.receipt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile */}
          <ul className="space-y-2 md:hidden">
            {items.map((item) => (
              <li key={item.key}>
                <Card className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <ItemCell item={item} />
                    <span className="shrink-0 tabular-nums font-semibold text-gray-900">{amountLabel(item)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{item.recordedAt ? formatReceiptDate(item.recordedAt) ?? "—" : "—"}</span>
                    <span aria-hidden>·</span>
                    <span>{item.typeLabel}</span>
                    <Badge variant={STATUS_VARIANTS[item.paymentStatus] ?? "muted"}>{item.paymentStatusLabel}</Badge>
                    {item.refundLabel && <Badge variant="neutral">{item.refundLabel}</Badge>}
                  </div>
                  <ReceiptAction action={item.receipt} />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
