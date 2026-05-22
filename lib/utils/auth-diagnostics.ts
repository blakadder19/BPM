/**
 * Auth signup / confirmation-email diagnostics helpers.
 *
 * Pure utility module — no React, no Supabase, no Next.js. Safe to
 * import from client components, server components, and tests.
 *
 * Used to support investigation of the user-reported 10–15 minute
 * delay on signup confirmation emails. The actual confirmation
 * email is sent by Supabase Auth (via custom SMTP, presumably
 * Brevo), NOT by BPM, so the only signal we can capture in our own
 * code is:
 *
 *   * how long Supabase's `signUp` RPC takes to return,
 *   * what Supabase reported back (user / session / error),
 *   * and a per-attempt correlation id we can surface in the UI so
 *     support can match a user's report to a server log line.
 *
 * Privacy rules (see docs/diagnostics/signup-email-delay.md):
 *   * Never log a full email address; use `maskEmail` or
 *     `emailDomain` instead.
 *   * Never log passwords, tokens, magic links or any Authorization
 *     header value.
 *   * Never include the `token_hash` / `code` query params from the
 *     confirmation URL — the redirect URL **origin and path** are
 *     fine, but query strings are not.
 */

/**
 * Mask the local part of an email so logs and UI can still indicate
 * roughly which address was used without exposing the full identity.
 *
 *   "alice@gmail.com"        → "a***@gmail.com"
 *   "bob@studio.example.com" → "b***@studio.example.com"
 *   "x@y.io"                 → "x***@y.io"
 *   ""                       → "***"
 *   "no-at-sign"             → "***"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return "***";
  const head = local[0] ?? "";
  return `${head}***@${domain}`;
}

/**
 * Extract just the domain portion of an email for histograms /
 * grouped logging (e.g. "gmail.com" vs "yahoo.com" delay patterns).
 * Returns `"unknown"` on malformed input so log shape stays stable.
 */
export function emailDomain(email: string | null | undefined): string {
  if (!email) return "unknown";
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "unknown";
  return email.slice(at + 1).toLowerCase();
}

/**
 * Short, URL-safe correlation id for a single signup attempt.
 * Generated client-side, surfaced in:
 *
 *   * every `[signup] …` log line for that attempt,
 *   * the small footnote on the "check your email" screen so a
 *     user-pasted screenshot lets us grep server logs.
 *
 * Format: `s_` + 8 lowercase base36 chars.
 * Example: `s_k3l9p2qx`.
 *
 * Uses `crypto.getRandomValues` when available (browser + modern
 * Node), falls back to `Math.random` so the helper stays usable
 * everywhere (the falls-back path is fine for a correlation id —
 * it is not security-sensitive).
 */
export function newSignupAttemptId(): string {
  // 5 random bytes → up to 2^40-1 ≈ 1.1e12, comfortably representable
  // in a JS `number` (Number.MAX_SAFE_INTEGER ≈ 9.0e15), so we don't
  // need BigInt and we avoid the ES target bump.
  const bytes = new Uint8Array(5);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let n = 0;
  for (const b of bytes) n = n * 256 + b;
  return `s_${n.toString(36).padStart(8, "0").slice(-8)}`;
}

/** Parse `URL`-style path+origin out of a `emailRedirectTo` string for safe logging (drops query/hash, keeps origin + pathname). Returns the raw input on parse error. */
export function safeRedirectTarget(url: string | null | undefined): string {
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}
