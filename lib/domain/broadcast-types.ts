/**
 * Shared types and labels for admin broadcasts.
 * Safe to import from both server and client code.
 */

export type AudienceType =
  | "all_students"
  | "specific_students"
  | "with_active_subscription"
  | "with_pending_payment"
  | "with_membership"
  | "with_pass"
  | "without_subscription";

export interface AudienceParams {
  studentIds?: string[];
}

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  all_students: "All active students",
  specific_students: "Specific students",
  with_active_subscription: "Students with active subscription",
  with_pending_payment: "Students with pending payment",
  with_membership: "Students with membership (unlimited)",
  with_pass: "Students with class pass (credits)",
  without_subscription: "Students without any active subscription",
};
