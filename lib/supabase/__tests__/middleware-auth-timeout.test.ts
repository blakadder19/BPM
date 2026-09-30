import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

const auth = {
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}));

import { updateSession, authUnavailableResponse } from "../middleware";
import { middleware } from "@/middleware";

const TIMEOUT = 50;
const hang = () => new Promise(() => {});
const signedIn = { id: "user-1", email: "a@b.c" };
const networkError = () => new AuthRetryableFetchError("fetch failed", 0);

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

  it("fails closed when getUser() throws", async () => {
    auth.getUser.mockRejectedValue(new Error("boom"));
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: null, authUnavailable: true });
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});

describe("updateSession — Auth answers", () => {
  it("returns the validated user", async () => {
    auth.getUser.mockResolvedValue({ data: { user: signedIn }, error: null });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: signedIn, authUnavailable: false });
  });

  it.each([
    ["network failure", networkError()],
    ["Auth 5xx", new AuthApiError("upstream error", 500, undefined)],
    ["rate limit", new AuthApiError("over_request_rate_limit", 429, "over_request_rate_limit")],
  ])("fails closed on a transient error (%s): no user, never the cookie session, no sign-out", async (_label, error) => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error });
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: null, authUnavailable: true });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("never trusts the cookie session when Auth rejects the token", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 403, "bad_jwt"),
    });
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const result = await updateSession(request("/dashboard", withSession), TIMEOUT);

    expect(result).toMatchObject({ user: null, authUnavailable: false });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("ignores a client-set bpm_fresh_jwt cookie and still validates with getUser()", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 403, "bad_jwt"),
    });
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const result = await updateSession(
      request("/dashboard", { ...withSession, bpm_fresh_jwt: "1" }),
      TIMEOUT,
    );

    expect(auth.getUser).toHaveBeenCalled();
    expect(result.user).toBeNull();
  });
});

describe("root middleware — protected access fails closed", () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = "supabase";
  });
  afterEach(() => {
    delete process.env.DATA_PROVIDER;
  });

  it("serves the 503 auth error, not the page, when Auth cannot verify the session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: networkError() });
    auth.getSession.mockResolvedValue({ data: { session: { user: signedIn } } });

    const res = await middleware(request("/finance", withSession));

    expect(res.status).toBe(503);
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("redirects to /login when Auth rejects the session", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 403, "bad_jwt"),
    });

    const res = await middleware(request("/finance", withSession));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets a verified session through", async () => {
    auth.getUser.mockResolvedValue({ data: { user: signedIn }, error: null });

    const res = await middleware(request("/finance", withSession));

    expect(res.headers.get("x-middleware-next")).toBe("1");
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
