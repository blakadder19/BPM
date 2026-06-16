/**
 * Auth-contract tests for the daily lifecycle cron route at
 * `/api/lifecycle`. The route is the trigger for the new
 * `renewal_reminder` workflow, so we need to guarantee:
 *
 *   * missing / invalid `Authorization` header → 401 Unauthorized
 *   * matching `Bearer ${CRON_SECRET}` → 200 OK with a JSON body
 *
 * We stub `runTermLifecycleAction` so the test never touches Supabase,
 * Brevo, or `student_notifications` — the auth gate is the only thing
 * under test here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub the heavy server action BEFORE importing the route module so
// the vi.mock hoist replaces it cleanly.
vi.mock("@/lib/actions/term-lifecycle", () => ({
  runTermLifecycleAction: vi.fn(async () => ({
    success: true,
    result: { expired: 0, renewalsPrepared: 0, details: [] },
  })),
}));

import { runTermLifecycleAction } from "@/lib/actions/term-lifecycle";
import { GET, POST } from "../route";

const FAKE_SECRET = "test-cron-secret-1234";

describe("/api/lifecycle auth gate", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = FAKE_SECRET;
    process.env.NODE_ENV = "production";
    (runTermLifecycleAction as unknown as { mockClear?: () => void }).mockClear?.();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects requests with no Authorization header (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unauthor/i);
    expect(runTermLifecycleAction).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong bearer token (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: "Bearer not-the-real-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(runTermLifecycleAction).not.toHaveBeenCalled();
  });

  it("rejects requests with the right token but wrong scheme (401)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: FAKE_SECRET },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
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
    expect(runTermLifecycleAction).toHaveBeenCalledWith("scheduled");
  });

  it("treats POST the same as GET (so Vercel + external cron both work)", async () => {
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "POST",
      headers: { authorization: `Bearer ${FAKE_SECRET}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 if the lifecycle action itself fails", async () => {
    (runTermLifecycleAction as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      success: false,
      error: "Database unreachable",
    });
    const req = new Request("https://app.example.com/api/lifecycle", {
      method: "GET",
      headers: { authorization: `Bearer ${FAKE_SECRET}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("returns 409 if a run is already in progress", async () => {
    (runTermLifecycleAction as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
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
