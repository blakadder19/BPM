import { getSettings } from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import { SettingsForm } from "@/components/settings/settings-form";

export default function SettingsPage() {
  const settings = getSettings();
  const roleBalancedStyles = DANCE_STYLES.filter((s) => s.requiresRoleBalance).map(
    (s) => s.name
  );

  return (
    <SettingsForm initialSettings={settings} roleBalancedStyles={roleBalancedStyles} />
  );
}
