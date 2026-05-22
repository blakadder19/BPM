import { describe, it, expect } from "vitest";
import {
  maskEmail,
  emailDomain,
  newSignupAttemptId,
  safeRedirectTarget,
} from "../auth-diagnostics";

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("alice@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("bob@studio.example.com")).toBe("b***@studio.example.com");
    expect(maskEmail("x@y.io")).toBe("x***@y.io");
  });

  it("never reveals the full local part", () => {
    expect(maskEmail("verylongname@example.com")).not.toContain("verylongname");
  });

  it("returns *** on malformed input", () => {
    expect(maskEmail("")).toBe("***");
    expect(maskEmail(null)).toBe("***");
    expect(maskEmail(undefined)).toBe("***");
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@nolocal.com")).toBe("***");
  });
});

describe("emailDomain", () => {
  it("returns the domain in lowercase", () => {
    expect(emailDomain("alice@Gmail.COM")).toBe("gmail.com");
    expect(emailDomain("test@studio.example.com")).toBe("studio.example.com");
  });

  it("returns 'unknown' on malformed input", () => {
    expect(emailDomain("")).toBe("unknown");
    expect(emailDomain(null)).toBe("unknown");
    expect(emailDomain("no-at-sign")).toBe("unknown");
    expect(emailDomain("trailing@")).toBe("unknown");
  });
});

describe("newSignupAttemptId", () => {
  it("matches the s_<8 lowercase base36 chars> shape", () => {
    for (let i = 0; i < 50; i++) {
      const id = newSignupAttemptId();
      expect(id).toMatch(/^s_[0-9a-z]{8}$/);
    }
  });

  it("is unique across many invocations (smoke test)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newSignupAttemptId());
    // Birthday bound for 8 base36 chars is enormous; expect no
    // collisions on 1k samples.
    expect(seen.size).toBe(1000);
  });
});

describe("safeRedirectTarget", () => {
  it("returns origin + pathname only (drops query, hash, tokens)", () => {
    expect(
      safeRedirectTarget(
        "https://book.example.com/auth/callback?next=/onboarding&token_hash=SECRET",
      ),
    ).toBe("https://book.example.com/auth/callback");
    expect(
      safeRedirectTarget("https://book.example.com/auth/callback#code=foo"),
    ).toBe("https://book.example.com/auth/callback");
  });

  it("returns '(none)' for empty / null", () => {
    expect(safeRedirectTarget("")).toBe("(none)");
    expect(safeRedirectTarget(null)).toBe("(none)");
    expect(safeRedirectTarget(undefined)).toBe("(none)");
  });

  it("returns the raw input on parse error", () => {
    expect(safeRedirectTarget("not a url")).toBe("not a url");
  });
});
