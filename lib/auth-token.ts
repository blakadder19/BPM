import type { JwtHeader, JwtPayload, SupabaseClient } from "@supabase/supabase-js";

/**
 * Verification of the Supabase access token carried in the session cookie.
 *
 * Signature (and exp) are checked by auth-js `getClaims()`:
 *   - asymmetric tokens (ES256/RS256 with a `kid`) are verified locally with
 *     WebCrypto against the project JWKS. The JWKS is cached for 10 minutes
 *     per process; a `kid` missing from the cache forces a re-fetch, and a
 *     `kid` missing from the fresh JWKS falls back to Supabase Auth
 *     (`/auth/v1/user`), so a stale cache can only reject, never accept.
 *   - anything else (HS*, no `kid`, no `alg`) is sent to Supabase Auth.
 * Everything else — algorithm, issuer, audience, subject, Postgres role,
 * nbf and exp again — is checked here, because getClaims() does not.
 */

export const ACCEPTED_JWT_ALGS: readonly string[] = ["ES256", "RS256"];
export const EXPECTED_AUDIENCE = "authenticated";
export const TOKEN_VERIFY_TIMEOUT_MS = 5000;

export function expectedIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}

/** Returns the reason the token must be rejected, or null when it is acceptable. */
export function rejectAccessToken(
  header: Partial<JwtHeader> | undefined,
  claims: Partial<JwtPayload> | undefined,
  opts: { issuer: string; nowSeconds: number },
): string | null {
  if (!header || !claims) return "missing header or claims";
  if (!header.alg || !ACCEPTED_JWT_ALGS.includes(header.alg)) return `unexpected alg ${header.alg}`;
  if (typeof header.kid !== "string" || header.kid === "") return "missing kid";
  if (typeof claims.sub !== "string" || claims.sub === "") return "missing sub";
  if (typeof claims.exp !== "number" || claims.exp <= opts.nowSeconds) return "expired or missing exp";
  if (typeof claims.nbf === "number" && claims.nbf > opts.nowSeconds) return "not yet valid";
  if (claims.iss !== opts.issuer) return "unexpected issuer";
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(EXPECTED_AUDIENCE) : aud === EXPECTED_AUDIENCE;
  if (!audOk) return "unexpected audience";
  if (claims.role !== "authenticated") return "unexpected role claim";
  if (claims.is_anonymous === true) return "anonymous session";
  return null;
}

/**
 * Verified claims for the current session, or null. Fails closed: any
 * verification error, timeout or rejected claim yields null.
 */
export async function verifySessionClaims(
  auth: Pick<SupabaseClient["auth"], "getClaims">,
  supabaseUrl: string,
  timeoutMs: number = TOKEN_VERIFY_TIMEOUT_MS,
): Promise<JwtPayload | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const result = await Promise.race([auth.getClaims(), timeout]);
    if (!result || result.error || !result.data) return null;
    const reason = rejectAccessToken(result.data.header, result.data.claims, {
      issuer: expectedIssuer(supabaseUrl),
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    return reason ? null : result.data.claims;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
