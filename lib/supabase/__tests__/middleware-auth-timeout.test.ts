import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const auth = {
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}));

import { updateSession, authUnavailableResponse } from "../middleware";

const TIMEOUT = 50;
const hang = () => new Promise(() => {});
const signedIn = { id: "user-1", email: "a@b.c" };

function request(path = "/dashboard", cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "https://book.example.com"));
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

const withSession = { "sb-abc-auth-token": "token" };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.getUser.mockReset();
  auth.getSession.mockReset();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateSession — Auth timeouts", () => {
  it("reports Auth as unavailable when getUser() hangs, instead of hanging the request", async () => {
    auth.getUser.mockImplementation(hang);

    const started = Date.now();
    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result.authUnavailable).toBe(true);
    expect(result.user).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does NOT sign the user out when Auth times out", async () => {
    // Signing out here would log every user out for the length of an
    // Auth outage, even though nothing is wrong with their session.
    auth.getUser.mockImplementation(hang);

    await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("does NOT trust the unvalidated cookie session when getUser() hangs", async () => {
    auth.getUser.mockImplementation(hang);
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result.user).toBeNull();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("bounds the fresh-login getSession() path too, since it can refresh over the network", async () => {
    auth.getSession.mockImplementation(hang);

    const result = await updateSession(
      request("/dashboard", { ...withSession, bpm_fresh_jwt: "1" }),
      TIMEOUT,
    );

    expect(result.authUnavailable).toBe(true);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("bounds the fallback getSession() after a fast getUser() error", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("fetch failed") });
    auth.getSession.mockImplementation(hang);

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result.authUnavailable).toBe(true);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("updateSession — unchanged behaviour when Auth answers", () => {
  it("returns the validated user", async () => {
    auth.getUser.mockResolvedValue({ data: { user: signedIn }, error: null });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: signedIn, authUnavailable: false });
  });

  it("keeps the existing fast-error fallback to the cookie session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("fetch failed") });
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: signedIn, authUnavailable: false });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("still clears a genuinely invalid session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid JWT") });
    auth.getSession.mockResolvedValue({ data: { session: null } });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: null, authUnavailable: false });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("authUnavailableResponse", () => {
  it("returns a non-cacheable 503 with Retry-After", async () => {
    const res = authUnavailableResponse("/dashboard");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain('href="/dashboard"');
  });

  it("never links off-site", async () => {
    expect(await authUnavailableResponse("//evil.example/x").text()).toContain('href="/"');
    expect(await authUnavailableResponse("https://evil.example").text()).toContain('href="/"');
  });

  it("escapes the retry path", async () => {
    const body = await authUnavailableResponse('/bookings?q="><script>').text();
    expect(body).not.toContain("<script>");
  });
});
