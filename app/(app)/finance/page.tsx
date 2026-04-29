import { getFinanceData } from "@/lib/actions/finance";
import { getFinanceSuperAdminStatus } from "@/lib/actions/finance-admin";
import { FinanceClient } from "@/components/finance/finance-client";
import { requireAnyPermission } from "@/lib/staff-permissions";

export default async function FinancePage() {
  await requireAnyPermission(["finance:view", "payments:view", "payments:view_limited"]);
  const [data, superAdminStatus] = await Promise.all([
    getFinanceData(),
    getFinanceSuperAdminStatus(),
  ]);

  return (
    <FinanceClient
      transactions={data.transactions}
      metrics={data.metrics}
      auditLog={data.auditLog}
      superAdminStatus={superAdminStatus}
    />
  );
}
