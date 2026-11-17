/**
 * Only `/receipt/<token>` is reachable without a session. Student and staff
 * receipt downloads under `/api/receipts/**` and look-alike paths still go
 * through the session check.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = { getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn() };

vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));

import { middleware } from "@/middleware";

const PREVIOUS_ENV = {
  DATA_PROVIDER: process.env.DATA_PROVIDER,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function request(path: string) {
  return new NextRequest(new URL(path, "https://preview.example.test"));
}

beforeEach(() => {
  process.env.DATA_PROVIDER = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  auth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
});

afterAll(() => {
  for (const [name, value] of Object.entries(PREVIOUS_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("middleware receipt routing", () => {
  it("lets a signed-out visitor reach /receipt/<token> without an auth lookup", async () => {
    const res = await middleware(request("/receipt/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    "/api/receipts/event/8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d",
    "/api/receipts/subscription/8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d",
    "/api/receipts/staff/event/8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d",
    "/receipts",
    "/receipt-admin",
    "/payments",
  ])("sends a signed-out visitor on %s to login", async (path) => {
    const res = await middleware(request(path));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});
