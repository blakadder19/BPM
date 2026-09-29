/**
 * auth.users is consulted only to backfill `student_profiles.auth_linked_at`
 * for students whose provisioning never set it. A student who has never
 * signed in stays "unclaimed" forever, so an unbounded lookup listed every
 * Auth user on every student load. The TTL bounds that to one listing per
 * window per server instance; the cost is that a newly signed-in student
 * may show as unclaimed for up to one window.
 */
export const AUTH_LAST_SIGN_IN_TTL_MS = 10 * 60 * 1000;

export interface AuthUserSignIn {
  id: string;
  last_sign_in_at?: string | null;
}

export function createLastSignInLookup(
  listUsers: () => Promise<AuthUserSignIn[]>,
  ttlMs: number = AUTH_LAST_SIGN_IN_TTL_MS,
  now: () => number = Date.now,
): () => Promise<Map<string, string>> {
  let cache: { fetchedAt: number; lastSignIn: Map<string, string> } | null = null;
  let inFlight: Promise<Map<string, string>> | null = null;

  return async () => {
    if (cache && now() - cache.fetchedAt < ttlMs) return cache.lastSignIn;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const users = await listUsers();
        const lastSignIn = new Map<string, string>();
        for (const u of users) {
          if (u.last_sign_in_at) lastSignIn.set(u.id, u.last_sign_in_at);
        }
        // Only a successful listing is cached; a failure retries next call.
        cache = { fetchedAt: now(), lastSignIn };
        return lastSignIn;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
