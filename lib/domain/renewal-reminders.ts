/**
 * Pure helpers for the "upcoming auto-renewal" reminder workflow.
 *
 * The cron-side server action (`runTermLifecycleAction`) imports
 * `findRenewalReminderCandidates` to pick which subscriptions should
 * trigger an email today, then dispatches `renewalReminderEvent`s.
 *
 * Keeping the logic pure means the rules ("autoRenew=true",
 * "validUntil within reminder window", "still active") are easy to
 * unit-test without needing the Supabase/Brevo/cron stack.
 */

import type { MockSubscription } from "@/lib/mock-data";

// ── Config ──────────────────────────────────────────────────

/**
 * Default cadence — how many days BEFORE the renewal date the
 * reminder should fire. Overridable via the
 * `BPM_RENEWAL_REMINDER_DAYS_BEFORE` env var so ops can tune it
 * without redeploying. The env var accepts a single integer or a
 * comma-separated list (e.g. "14,7,1") to enable multi-step cadence.
 */
export const DEFAULT_RENEWAL_REMINDER_DAYS_BEFORE = 7;

const ENV_VAR_NAME = "BPM_RENEWAL_REMINDER_DAYS_BEFORE";

/**
 * Resolve the reminder cadence from env. Returns at least one entry
 * (the default) on any parse error so the workflow never silently
 * disables itself.
 */
export function resolveReminderDaysBefore(envValue?: string): number[] {
  const raw = (envValue ?? process.env[ENV_VAR_NAME] ?? "").trim();
  if (!raw) return [DEFAULT_RENEWAL_REMINDER_DAYS_BEFORE];
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 365);
  return parsed.length > 0 ? Array.from(new Set(parsed)).sort((a, b) => b - a) : [DEFAULT_RENEWAL_REMINDER_DAYS_BEFORE];
}

// ── Date math (pure, UTC-anchored) ──────────────────────────

/**
 * Whole-day delta between two ISO `YYYY-MM-DD` dates. Positive when
 * `to` is in the future relative to `from`. Identical implementation
 * to `term-lifecycle.daysUntilDate` so renewal cadences stay aligned
 * with the existing "renewal_due_soon" loop.
 */
export function daysBetweenISO(from: string, to: string): number {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return Number.NaN;
  return Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Candidate selection ────────────────────────────────────

export interface ReminderCandidate {
  subscription: MockSubscription;
  renewalDate: string;
  daysUntilRenewal: number;
  daysBefore: number;
  autoRenewConfirmed: boolean;
}

export interface FindCandidatesInput {
  subscriptions: MockSubscription[];
  /** Today as `YYYY-MM-DD` (UTC). */
  today: string;
  /** Cadence buckets — e.g. [7] or [14, 7, 1]. */
  daysBeforeCadence: readonly number[];
}

/**
 * Pick subscriptions due for a renewal reminder TODAY.
 *
 * Eligibility (every condition must hold):
 *   1. Subscription is `active` (we don't remind for paused/expired/exhausted/cancelled).
 *   2. `paymentStatus` is `paid` or `complimentary` (paying customers
 *      only — a pending row shouldn't get a "renewal coming up"
 *      reminder; that's what `renewal_due_soon` already covers).
 *   3. `autoRenew === true` — non-auto-renew subs never trigger a
 *      reminder; they would be misleading.
 *   4. `validUntil` is set, well-formed, and exactly `daysBefore`
 *      whole days away from today. Using equality (not `≤`) lets us
 *      run multi-cadence (14/7/1) without overlapping fires — each
 *      bucket triggers exactly once per renewal.
 *
 * The caller is responsible for:
 *   * Resolving the student's email (the dispatch layer handles that).
 *   * Idempotency — `idempotencyKey` on the comm event prevents
 *     duplicate sends across cron runs.
 */
export function findRenewalReminderCandidates(
  input: FindCandidatesInput,
): ReminderCandidate[] {
  const out: ReminderCandidate[] = [];
  const cadence = [...input.daysBeforeCadence].filter((n) => Number.isFinite(n) && n > 0);
  if (cadence.length === 0) return out;

  for (const sub of input.subscriptions) {
    if (!isRemindable(sub)) continue;
    const renewalDate = sub.validUntil;
    if (!renewalDate) continue;
    const days = daysBetweenISO(input.today, renewalDate);
    if (!Number.isFinite(days)) continue;
    for (const bucket of cadence) {
      if (days === bucket) {
        out.push({
          subscription: sub,
          renewalDate,
          daysUntilRenewal: days,
          daysBefore: bucket,
          autoRenewConfirmed: isAutoRenewConfirmed(sub),
        });
        break;
      }
    }
  }

  return out;
}

/**
 * A subscription is "remindable" when it's an active, paid (or
 * complimentary) auto-renew row that has a real `validUntil` date.
 *
 * Exported so the cron loop and unit tests can share the same gate.
 */
export function isRemindable(sub: MockSubscription): boolean {
  if (sub.status !== "active") return false;
  if (!sub.autoRenew) return false;
  if (sub.paymentStatus !== "paid" && sub.paymentStatus !== "complimentary") return false;
  if (!sub.validUntil) return false;
  return true;
}

/**
 * BPM only auto-creates a pending next-term subscription row when
 * `autoRenew=true`; it does not auto-bill via Stripe. We surface the
 * boolean so the email template can pick the right phrasing — see
 * `RenewalReminderPayload.autoRenewConfirmed` in
 * `lib/communications/events.ts`.
 *
 * Today this is a simple passthrough, but having a dedicated helper
 * means we can sharpen it later (e.g. require `productSnapshot.autoRenew
 * === true`) without touching the cron loop.
 */
export function isAutoRenewConfirmed(sub: MockSubscription): boolean {
  return sub.autoRenew === true;
}

/**
 * Format a subscription price as a display string for the email
 * template. Returns null when the price is unknown so the template
 * can omit the row entirely rather than rendering "€NaN".
 */
export function formatRenewalAmount(sub: MockSubscription): string | null {
  const cents = sub.priceCentsAtPurchase;
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  const currency = (sub.currencyAtPurchase ?? "EUR").toUpperCase();
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
