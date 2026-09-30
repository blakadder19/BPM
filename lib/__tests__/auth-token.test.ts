import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AuthClient } from "@supabase/supabase-js";
import { rejectAccessToken, verifySessionClaims, expectedIssuer } from "@/lib/auth-token";

// Real auth-js getClaims() + real WebCrypto ES256 signatures; only the
// network (JWKS, /user, /token) is faked.

const SUPABASE_URL = "https://proj.supabase.co";
const ISSUER = expectedIssuer(SUPABASE_URL);
const now = () => Math.floor(Date.now() / 1000);

interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: JsonWebKey & { kid: string; alg: string };
}

async function makeKey(kid: string): Promise<TestKey> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid, alg: "ES256" };
  return { kid, privateKey, jwk };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    sub: "user-1",
    aud: "authenticated",
    role: "authenticated",
    email: "student@example.com",
    exp: now() + 3600,
    iat: now(),
    user_metadata: { role: "admin" },
    ...overrides,
  };
}

async function signES256(key: TestKey, payload: object, header: object = {}): Promise<string> {
  const signingInput = `${b64({ alg: "ES256", typ: "JWT", kid: key.kid, ...header })}.${b64(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(sig).toString("base64url")}`;
}

async function signHS256(secret: string, payload: object): Promise<string> {
  const signingInput = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(sig).toString("base64url")}`;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let clientSeq = 0;

function makeClient(opts: {
  jwks: () => { keys: object[] } | Error;
  userEndpoint?: () => Response;
}) {
  const storageKey = `sb-auth-token-test-${++clientSeq}`;
  const store = new Map<string, string>();
  const calls = { jwks: 0, user: 0 };

  const setToken = (token: string) =>
    store.set(
      storageKey,
      JSON.stringify({
        access_token: token,
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now() + 3600,
        user: { id: "user-1", aud: "authenticated", email: "student@example.com" },
      }),
    );

  const fakeFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/.well-known/jwks.json")) {
      calls.jwks++;
      const body = opts.jwks();
      if (body instanceof Error) throw body;
      return json(200, body);
    }
    if (url.includes("/user")) {
      calls.user++;
      return opts.userEndpoint?.() ?? json(403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    if (url.includes("/token")) {
      return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "no" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const client = new AuthClient({
    url: ISSUER,
    headers: { apikey: "anon" },
    storageKey,
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: fakeFetch as typeof fetch,
  });

  return { client, calls, setToken };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifySessionClaims — real signatures", () => {
  it("accepts a valid ES256 token signed by the project key", async () => {
    const key = await makeKey("kid-a");
    const { client, setToken } = makeClient({ jwks: () => ({ keys: [key.jwk] }) });
    setToken(await signES256(key, claims()));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toMatchObject({ sub: "user-1" });
  });

  it("rejects a tampered payload (signature no longer matches)", async () => {
    const key = await makeKey("kid-a");
    const { client, setToken } = makeClient({ jwks: () => ({ keys: [key.jwk] }) });
    const [h, , s] = (await signES256(key, claims())).split(".");
    setToken(`${h}.${b64(claims({ sub: "victim-admin" }))}.${s}`);

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
  });

  it("rejects a token signed by another key that claims the project kid", async () => {
    const key = await makeKey("kid-a");
    const attacker = await makeKey("kid-a");
    const { client, setToken } = makeClient({ jwks: () => ({ keys: [key.jwk] }) });
    setToken(await signES256(attacker, claims()));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
  });

  it("rejects a forged unsigned cookie session (alg none) — Supabase Auth refuses it", async () => {
    const { client, calls, setToken } = makeClient({ jwks: () => ({ keys: [] }) });
    setToken(`${b64({ alg: "none", typ: "JWT" })}.${b64(claims())}.${Buffer.from("x").toString("base64url")}`);

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
    expect(calls.user).toBe(1);
  });

  it("rejects an expired token even while the cookie claims the session is fresh", async () => {
    const key = await makeKey("kid-a");
    const { client, setToken } = makeClient({ jwks: () => ({ keys: [key.jwk] }) });
    setToken(await signES256(key, claims({ exp: now() - 60 })));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
  });

  it("rejects an HS256 token even when Supabase Auth vouches for it (algorithm pinning)", async () => {
    const { client, setToken } = makeClient({
      jwks: () => ({ keys: [] }),
      userEndpoint: () => json(200, { id: "user-1", aud: "authenticated" }),
    });
    setToken(await signHS256("legacy-secret", claims()));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
  });

  it("rejects a validly signed token for the wrong project (issuer)", async () => {
    const key = await makeKey("kid-a");
    const { client, setToken } = makeClient({ jwks: () => ({ keys: [key.jwk] }) });
    setToken(await signES256(key, claims({ iss: "https://other.supabase.co/auth/v1" })));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
  });
});

describe("verifySessionClaims — signing-key rotation", () => {
  it("re-fetches the JWKS for an unknown kid and accepts the new key", async () => {
    const keyA = await makeKey("kid-a");
    const keyB = await makeKey("kid-b");
    let published = [keyA.jwk];
    const { client, calls, setToken } = makeClient({ jwks: () => ({ keys: published }) });

    setToken(await signES256(keyA, claims()));
    expect(await verifySessionClaims(client, SUPABASE_URL)).not.toBeNull();
    expect(calls.jwks).toBe(1);

    published = [keyA.jwk, keyB.jwk];
    setToken(await signES256(keyB, claims()));
    expect(await verifySessionClaims(client, SUPABASE_URL)).not.toBeNull();
    expect(calls.jwks).toBe(2);

    setToken(await signES256(keyA, claims()));
    expect(await verifySessionClaims(client, SUPABASE_URL)).not.toBeNull();
    expect(calls.jwks).toBe(2);
  });

  it("never accepts a kid missing from the fresh JWKS unless Supabase Auth verifies it", async () => {
    const keyA = await makeKey("kid-a");
    const unknown = await makeKey("kid-unknown");
    const { client, calls, setToken } = makeClient({ jwks: () => ({ keys: [keyA.jwk] }) });
    setToken(await signES256(unknown, claims()));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
    expect(calls.jwks).toBe(1);
    expect(calls.user).toBe(1);
  });

  it("fails closed when the JWKS cannot be fetched (cold cache, Auth unreachable)", async () => {
    const key = await makeKey("kid-a");
    const { client, setToken } = makeClient({ jwks: () => new TypeError("fetch failed") });
    setToken(await signES256(key, claims()));

    expect(await verifySessionClaims(client, SUPABASE_URL)).toBeNull();
  });

  it("fails closed when verification hangs", async () => {
    const hanging = { getClaims: () => new Promise<never>(() => {}) };

    const started = Date.now();
    expect(await verifySessionClaims(hanging as never, SUPABASE_URL, 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("rejectAccessToken — claim checks after the signature", () => {
  const header = { alg: "ES256" as const, kid: "kid-a", typ: "JWT" };
  const opts = { issuer: ISSUER, nowSeconds: now() };

  it("accepts well-formed claims", () => {
    expect(rejectAccessToken(header, claims(), opts)).toBeNull();
    expect(rejectAccessToken(header, claims({ aud: ["authenticated", "x"] }), opts)).toBeNull();
  });

  it.each([
    ["missing sub", {}, { sub: undefined }],
    ["empty sub", {}, { sub: "" }],
    ["expired", {}, { exp: now() - 1 }],
    ["missing exp", {}, { exp: undefined }],
    ["not yet valid", {}, { nbf: now() + 600 }],
    ["wrong issuer", {}, { iss: "https://evil.example/auth/v1" }],
    ["wrong audience", {}, { aud: "service" }],
    ["anon role claim", {}, { role: "anon" }],
    ["service_role claim", {}, { role: "service_role" }],
    ["anonymous user", {}, { is_anonymous: true }],
    ["HS256 header", { alg: "HS256" }, {}],
    ["missing kid", { kid: undefined }, {}],
  ])("rejects %s", (_label, headerOverride, claimOverride) => {
    expect(rejectAccessToken({ ...header, ...headerOverride } as never, claims(claimOverride), opts)).not.toBeNull();
  });
});
