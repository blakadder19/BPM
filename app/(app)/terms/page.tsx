import { requireRole } from "@/lib/auth";
import { cachedGetTerms } from "@/lib/server/cached-queries";
import { getTodayStr } from "@/lib/domain/datetime";
import { AdminTerms } from "@/components/terms/admin-terms";

export default async function TermsPage() {
  const _t0 = performance.now();
  await requireRole(["admin"]);

  const terms = await cachedGetTerms();

  const _tEnd = performance.now();
  if (process.env.NODE_ENV === "development") console.info(`[perf /terms] total=${(_tEnd-_t0).toFixed(0)}ms`);

  return <AdminTerms terms={terms} today={getTodayStr()} />;
}
