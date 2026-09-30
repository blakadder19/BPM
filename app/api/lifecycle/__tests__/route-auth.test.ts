/**
 * Auth-contract tests for the daily lifecycle cron route at
 * `/api/lifecycle`. The route is the trigger for the new
 * `renewal_reminder` workflow, so we need to guarantee:
 *
 *   * missing / invalid `Authorization` header → 401 Unauthorized
 *   * matching `Bearer ${CRON_SECRET}` → 200 OK with a JSON body
 *
 * We stub the lifecycle service so the test never touches Supabase,
 * Brevo, or `student_notifications` — the auth gate is the only thing
 * under test here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/services/term-lifecycle-service", () => ({
  LIFECYCLE_ALREADY_RUNNING: "Lifecycle is already running. Try again shortly.",
  runTermLifecycle: vi.fn(async () => ({
    success: true,
    result: { expired: 0, renewalsPrepared: 0, details: [] },
  })),
}));

import { runTermLifecycle } from "@/lib/services/term-lifecycle-service";
import { GET, POST } from "../route";

const FAKE_SECRET = "test-cron-secret-1234";
const runMock = runTermLifecycle as unknown as ReturnType<typeof vi.fn>;

describe("/api/lifecycle auth gate", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", FAKE_SECRET);
    vi.stubEnv("NODE_ENV", "production");
    runMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests with no Authorization header (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unauthor/i);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong bearer token (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: "Bearer not-the-real-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("rejects a token that is a prefix of the real secret (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: `Bearer ${FAKE_SECRET.slice(0, -1)}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("rejects requests with the right token but wrong scheme (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: FAKE_SECRET },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("fails closed in production when CRON_SECRET is not configured (401)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: "Bearer " },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("succeeds with the correct bearer token (200)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: `Bearer ${FAKE_SECRET}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; trigger: string };
    expect(body.ok).toBe(true);
    expect(body.trigger).toBe("scheduled");
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("treats POST the same as GET (so Vercel + external cron both work)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "POST",
      headers: { authorization: `Bearer ${FAKE_SECRET}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 if the lifecycle run itself fails", async () => {
    runMock.mockResolvedValueOnce({ success: false, error: "Database unreachable" });
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: `Bearer ${FAKE_SECRET}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("returns 409 if a run is already in progress", async () => {
    runMock.mockResolvedValueOnce({
      success: false,
      error: "Lifecycle is already running. Try again shortly.",
    });
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: `Bearer ${FAKE_SECRET}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(409);
  });
});
