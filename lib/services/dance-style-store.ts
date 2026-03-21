/**
 * Dance style accessor — returns Supabase-bootstrapped styles in real mode,
 * mock data only in dev/demo mode (no Supabase configured).
 */

import { DANCE_STYLES, type MockDanceStyle } from "@/lib/mock-data";
import { getBootstrappedDanceStyles } from "./schedule-bootstrap";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getDanceStyles(): MockDanceStyle[] {
  const bootstrapped = getBootstrappedDanceStyles();
  if (bootstrapped) return bootstrapped;
  if (hasSupabaseConfig()) return [];
  return DANCE_STYLES;
}

export function getDanceStyle(id: string): MockDanceStyle | undefined {
  return getDanceStyles().find((s) => s.id === id);
}

export function getDanceStyleByName(name: string): MockDanceStyle | undefined {
  return getDanceStyles().find((s) => s.name === name);
}

export function styleRequiresRoleBalance(styleName: string | null): boolean {
  if (!styleName) return false;
  return getDanceStyles().find((s) => s.name === styleName)?.requiresRoleBalance ?? false;
}
