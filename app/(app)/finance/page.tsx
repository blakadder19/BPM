import { getFinanceData } from "@/lib/actions/finance";
import { FinanceClient } from "@/components/finance/finance-client";

export default async function FinancePage() {
  const data = await getFinanceData();

  return (
    <FinanceClient
      transactions={data.transactions}
      metrics={data.metrics}
      auditLog={data.auditLog}
    />
  );
}
