import { getStaffAccess, hasPermission, requirePermission } from "@/lib/staff-permissions";
import { getReceiptBusinessSettings, getSettings, hydrateSettings } from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import { SettingsForm, type SupabaseStatus } from "@/components/settings/settings-form";
import { StaffAccessCard } from "@/components/settings/staff-access-card";
import { ReceiptBusinessCard } from "@/components/settings/receipt-business-card";
import { isMemoryMode } from "@/lib/config/data-provider";
import { getAcademyName } from "@/lib/supabase/academy";
import { createAdminClient } from "@/lib/supabase/admin";

async function probeSupabaseStatus(): Promise<SupabaseStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { state: "not_configured" };
  }
  try {
    const client = createAdminClient();
    const { count, error } = await client
      .from("academies")
      .select("id", { count: "exact", head: true });
    if (error) {
      return { state: "error", detail: error.message };
    }
    return { state: "connected", projectUrl: url, tableCount: count ?? 0 };
  } catch (e) {
    return {
      state: "error",
      detail: e instanceof Error ? e.message : "Unknown connection error",
    };
  }
}

export default async function SettingsPage() {
  await requirePermission("settings:view");

  const settings = getSettings();
  const allStyles = DANCE_STYLES.map((s) => ({ id: s.id, name: s.name }));
  const supabaseStatus = await probeSupabaseStatus();

  const isDev = process.env.NODE_ENV === "development";

  // Show the "Staff access" pointer card only to users who can also
  // see /staff. Computing this server-side keeps the client component
  // free of any permission logic — it just receives a plain boolean.
  const access = await getStaffAccess();
  const canSeeStaffAccessCard = hasPermission(access, "staff:view");
  const permissions = {
    canEdit: hasPermission(access, "settings:edit"),
  };

  await hydrateSettings();
  const receiptBusiness = getReceiptBusinessSettings();
  const academyName = isMemoryMode() ? null : await getAcademyName().catch(() => null);

  return (
    <div className="space-y-6">
      <SettingsForm
        initialSettings={settings}
        allStyles={allStyles}
        supabaseStatus={supabaseStatus}
        isDev={isDev}
        permissions={permissions}
      />
      <ReceiptBusinessCard
        initialSettings={receiptBusiness}
        fallbackTradingName={academyName}
        canEdit={permissions.canEdit}
      />
      {canSeeStaffAccessCard && <StaffAccessCard />}
    </div>
  );
}
