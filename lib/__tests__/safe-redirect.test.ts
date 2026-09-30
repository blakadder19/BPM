import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/classes?x=1", "/classes?x=1"],
    ["/events/abc#tickets", "/events/abc#tickets"],
    ["/classes?q=salsa%20line", "/classes?q=salsa%20line"],
  ])("accepts %p", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "//evil.com/dashboard",
    "https://evil.com",
    "http://evil.com/dashboard",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.com",
    "dashboard",
    "",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/%2F%2Fevil.com",
    "/%2f%2fevil.com",
    "%2F%2Fevil.com",
    "/%5Cevil.com",
    "/%5cevil.com",
    "/%252F%252Fevil.com",
    "/%09/evil.com",
    "/%0a/evil.com",
    "/%E0%A4%A",
    " /dashboard",
  ])("rejects %p", (input) => {
    expect(safeRedirectPath(input)).toBeNull();
  });

  it("rejects null / undefined", () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });

  it("never returns a value that resolves to another origin", () => {
    const inputs = ["/a", "/./b", "/../c", "/a/../../d", "/%2e%2e/e"];
    for (const input of inputs) {
      const out = safeRedirectPath(input);
      if (out === null) continue;
      expect(new URL(out, "https://book.example.com").origin).toBe("https://book.example.com");
    }
  });
});
