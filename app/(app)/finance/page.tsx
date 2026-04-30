import { getFinanceData } from "@/lib/actions/finance";
import { getFinanceSuperAdminStatus } from "@/lib/actions/finance-admin";
import { FinanceClient } from "@/components/finance/finance-client";
import {
  getStaffAccess,
  hasAnyPermission,
  hasPermission,
  requireAnyPermission,
} from "@/lib/staff-permissions";

export default async function FinancePage() {
  await requireAnyPermission(["finance:view", "payments:view", "payments:view_limited"]);
  const [data, superAdminStatus, access] = await Promise.all([
    getFinanceData(),
    getFinanceSuperAdminStatus(),
    getStaffAccess(),
  ]);

  const permissions = {
    canMarkPaid: hasAnyPermission(access, [
      "finance:mark_paid",
      "payments:mark_paid_reception",
    ]),
    canRefund: hasAnyPermission(access, [
      "finance:refund",
      "payments:refund",
    ]),
    canDangerZone: hasPermission(access, "finance:danger_zone"),
  };

  return (
    <FinanceClient
      transactions={data.transactions}
      metrics={data.metrics}
      auditLog={data.auditLog}
      superAdminStatus={superAdminStatus}
      permissions={permissions}
    />
  );
}
