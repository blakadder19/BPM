/**
 * Admin user management — types and small helpers shared between
 * server actions and UI. NOT a "use server" module.
 */

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  isCurrentUser: boolean;
  /** ISO timestamp of when the public.users row was created. */
  createdAt: string | null;
}

export interface ListAdminsResult {
  success: boolean;
  error?: string;
  admins?: AdminUserSummary[];
  /** True iff Supabase admin auth APIs (service role) are reachable. */
  supabaseEnabled: boolean;
}

export interface InviteAdminResult {
  success: boolean;
  error?: string;
  /** Whether an email invite was actually dispatched (vs. promotion only). */
  invited?: boolean;
  /** True if the email already had an admin row and no action was needed. */
  alreadyAdmin?: boolean;
  /** True if an existing non-admin user was promoted. */
  promoted?: boolean;
  email?: string;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Very small RFC-5322-ish check, sufficient for invite UX gating. */
export function isProbablyValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
