import { requireRole } from "@/lib/auth";
import { getTermRepo } from "@/lib/repositories";
import { getTodayStr } from "@/lib/domain/datetime";
import { AdminTerms } from "@/components/terms/admin-terms";

export default async function TermsPage() {
  await requireRole(["admin"]);

  const terms = await getTermRepo().getAll();

  return <AdminTerms terms={terms} today={getTodayStr()} />;
}
