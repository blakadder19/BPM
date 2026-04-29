import { requireSuperAdmin } from "@/lib/staff-permissions";
import { getStudioHireRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminStudioHire } from "@/components/studio-hire/admin-studio-hire";

export default async function StudioHirePage() {
  await requireSuperAdmin();
  await ensureOperationalDataHydrated();

  const svc = getStudioHireRepo().getService();
  const entries = svc.getAll();

  return <AdminStudioHire entries={entries} />;
}
