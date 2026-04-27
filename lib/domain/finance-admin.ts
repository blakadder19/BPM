/**
 * Finance admin constants + types shared between server actions and UI.
 *
 * This module is intentionally NOT a `"use server"` module. Next.js only
 * allows async exports from `"use server"` files, so constants and type
 * definitions must live in a plain module like this one.
 */

export const FINANCE_TEST_DELETE_CONFIRMATION = "DELETE TEST DATA";

/** Canonical marker we append when a super-admin marks a record as test. */
export const FINANCE_TEST_MARKER = "[test]";

/**
 * All markers the candidate scan recognises (case-insensitive). Kept in sync
 * with the list used by `lib/actions/finance-admin.ts#hasTestMarker`.
 */
export const FINANCE_TEST_MARKERS_RECOGNISED = ["[test]", "#test", "test:"] as const;

export type FinanceMarkableSource = "subscription" | "penalty" | "event_purchase";

export interface MarkFinanceTestResult {
  success: boolean;
  error?: string;
  /** Whether the record now carries a test marker (after the action). */
  isMarked?: boolean;
  /** Indicates no change was made (already in the requested state). */
  alreadyInState?: boolean;
  source?: FinanceMarkableSource;
  recordId?: string;
}

export interface FinanceSuperAdminStatus {
  /** The current authenticated admin matches `BPM_SUPER_ADMIN_EMAIL`. */
  isSuperAdmin: boolean;
  /** `BPM_ALLOW_FINANCE_TEST_DELETE === "true"` in this environment. */
  envEnabled: boolean;
  /** Convenience: true iff both gates pass and danger UI should be rendered. */
  canDelete: boolean;
}

export interface FinanceTestCandidate {
  kind: FinanceMarkableSource;
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
  deletedEventPurchases?: number;
  skipped?: number;
  skippedReasons?: string[];
}
