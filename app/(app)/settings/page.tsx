import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import { SettingsForm, type SupabaseStatus } from "@/components/settings/settings-form";
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
  await requireRole(["admin"]);

  const settings = getSettings();
  const allStyles = DANCE_STYLES.map((s) => ({ id: s.id, name: s.name }));
  const supabaseStatus = await probeSupabaseStatus();

  const isDev = process.env.NODE_ENV === "development";

  return (
    <SettingsForm
      initialSettings={settings}
      allStyles={allStyles}
      supabaseStatus={supabaseStatus}
      isDev={isDev}
    />
  );
}
