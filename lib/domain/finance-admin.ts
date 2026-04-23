/**
 * Finance admin constants + types shared between server actions and UI.
 *
 * This module is intentionally NOT a `"use server"` module. Next.js only
 * allows async exports from `"use server"` files, so constants and type
 * definitions must live in a plain module like this one.
 */

export const FINANCE_TEST_DELETE_CONFIRMATION = "DELETE TEST DATA";

export interface FinanceSuperAdminStatus {
  /** The current authenticated admin matches `BPM_SUPER_ADMIN_EMAIL`. */
  isSuperAdmin: boolean;
  /** `BPM_ALLOW_FINANCE_TEST_DELETE === "true"` in this environment. */
  envEnabled: boolean;
  /** Convenience: true iff both gates pass and danger UI should be rendered. */
  canDelete: boolean;
}

export interface FinanceTestCandidate {
  kind: "subscription" | "penalty";
  id: string;
  label: string;
  detail: string | null;
  createdAt: string | null;
}

export interface ListFinanceTestCandidatesResult {
  success: boolean;
  error?: string;
  candidates?: FinanceTestCandidate[];
}

export interface DeleteFinanceTestResult {
  success: boolean;
  error?: string;
  deletedSubscriptions?: number;
  deletedPenalties?: number;
  skipped?: number;
  skippedReasons?: string[];
}
