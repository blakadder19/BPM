import { getFinanceData } from "@/lib/actions/finance";
import { getFinanceSuperAdminStatus } from "@/lib/actions/finance-admin";
import { FinanceClient } from "@/components/finance/finance-client";

export default async function FinancePage() {
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
