/**
 * Runtime mutable settings store, initialized from static business-rules
 * constants. In production, these would be persisted to a DB table.
 */

import {
  LATE_CANCEL_FEE_CENTS,
  NO_SHOW_FEE_CENTS,
  LATE_CANCEL_CUTOFF_MINUTES,
  ALLOWED_ROLE_IMBALANCE,
} from "@/config/business-rules";

export interface AppSettings {
  lateCancelFeeCents: number;
  noShowFeeCents: number;
  lateCancelCutoffMinutes: number;
  allowedRoleImbalance: number;
}

let settings: AppSettings = {
  lateCancelFeeCents: LATE_CANCEL_FEE_CENTS,
  noShowFeeCents: NO_SHOW_FEE_CENTS,
  lateCancelCutoffMinutes: LATE_CANCEL_CUTOFF_MINUTES,
  allowedRoleImbalance: ALLOWED_ROLE_IMBALANCE,
};

export function getSettings(): AppSettings {
  return { ...settings };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  settings = { ...settings, ...patch };
  return { ...settings };
}
