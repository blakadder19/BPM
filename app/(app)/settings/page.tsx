import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  await requireRole(["admin"]);

  const settings = getSettings();
  const allStyles = DANCE_STYLES.map((s) => ({ id: s.id, name: s.name }));

  return <SettingsForm initialSettings={settings} allStyles={allStyles} />;
}
