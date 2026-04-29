/**
 * Dance style accessor — returns Supabase-bootstrapped styles in real mode,
 * mock data only in dev/demo mode (no Supabase configured).
 */

import { DANCE_STYLES, type MockDanceStyle } from "@/lib/mock-data";
import { getBootstrappedDanceStyles } from "./schedule-bootstrap";
import { isSupabaseMode } from "@/lib/config/data-provider";

export function getDanceStyles(): MockDanceStyle[] {
  const bootstrapped = getBootstrappedDanceStyles();
  if (bootstrapped) return bootstrapped;
  if (isSupabaseMode()) return [];
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
