import { describe, it, expect, vi } from "vitest";
import { createLastSignInLookup } from "../auth-last-sign-in";

const USERS = [
  { id: "a", last_sign_in_at: "2026-09-01T10:00:00Z" },
  { id: "b", last_sign_in_at: null },
];

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("createLastSignInLookup", () => {
  it("maps only users that have signed in", async () => {
    const lookup = createLastSignInLookup(async () => USERS, 1000);
    const map = await lookup();
    expect(map.get("a")).toBe("2026-09-01T10:00:00Z");
    expect(map.has("b")).toBe(false);
  });

  it("lists Auth users once per window, not on every student load", async () => {
    const list = vi.fn(async () => USERS);
    const c = clock();
    const lookup = createLastSignInLookup(list, 1000, c.now);

    await lookup();
    await lookup();
    c.advance(999);
    await lookup();
    expect(list).toHaveBeenCalledTimes(1);

    c.advance(1);
    await lookup();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("shares one listing between concurrent callers", async () => {
    const list = vi.fn(async () => USERS);
    const lookup = createLastSignInLookup(list, 1000);
    await Promise.all([lookup(), lookup(), lookup()]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("holds a failed listing for one window instead of retrying on every load", async () => {
    const list = vi
      .fn<() => Promise<typeof USERS>>()
      .mockRejectedValueOnce(new Error("auth down"))
      .mockResolvedValueOnce(USERS);
    const c = clock();
    const lookup = createLastSignInLookup(list, 1000, c.now);

    await expect(lookup()).rejects.toThrow("auth down");
    expect((await lookup()).size).toBe(0);
    c.advance(999);
    await lookup();
    expect(list).toHaveBeenCalledTimes(1);

    c.advance(1);
    expect((await lookup()).get("a")).toBeDefined();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the last good map after a later failure", async () => {
    const list = vi
      .fn<() => Promise<typeof USERS>>()
      .mockResolvedValueOnce(USERS)
      .mockRejectedValueOnce(new Error("auth down"));
    const c = clock();
    const lookup = createLastSignInLookup(list, 1000, c.now);

    await lookup();
    c.advance(1000);
    await expect(lookup()).rejects.toThrow("auth down");
    expect((await lookup()).get("a")).toBe("2026-09-01T10:00:00Z");
    expect(list).toHaveBeenCalledTimes(2);
  });
});
