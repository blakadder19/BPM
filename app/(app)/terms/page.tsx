import { requireRole } from "@/lib/auth";
import { getTerms } from "@/lib/services/term-store";
import { AdminTerms } from "@/components/terms/admin-terms";

export default async function TermsPage() {
  await requireRole(["admin"]);

  const terms = getTerms();

  return <AdminTerms terms={terms} />;
}
