/**
 * Guest receipt tokens must never be part of a URL path or query string the
 * server receives (request logs record those). Links carry the token in the
 * fragment; the /receipt page strips it from the address bar and posts it
 * to /receipt/open in the request body.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/utils/app-url", () => ({ getAppUrl: () => "https://bpm.example.test" }));

import { guestReceiptUrl } from "@/lib/services/guest-receipt-delivery";
import { isAnalyticsExcludedPath } from "@/lib/analytics/tracking";

const ROOT = join(__dirname, "..", "..", "..");
const OPENER = readFileSync(join(ROOT, "components/receipts/guest-receipt-opener.tsx"), "utf8");

describe("guest receipt token transport", () => {
  it("links put the token in the fragment only", () => {
    const url = new URL(guestReceiptUrl("AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"));
    expect(url.pathname).toBe("/receipt");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde");
  });

  it("no route accepts a token in the path, and /receipt/open is POST-only", () => {
    expect(readdirSync(join(ROOT, "app/receipt")).sort()).toEqual(["open", "page.tsx"]);
    const route = readFileSync(join(ROOT, "app/receipt/open/route.ts"), "utf8");
    expect(route).toMatch(/export function POST\(/);
    expect(route).not.toMatch(/export (async )?function (GET|HEAD)\(/);
    expect(existsSync(join(ROOT, "app/receipt/[token]"))).toBe(false);
  });

  it("the page reads the fragment, removes it from history and posts it in the body", () => {
    expect(OPENER).toContain("window.location.hash");
    expect(OPENER).toMatch(/history\.replaceState\(null, "", window\.location\.pathname\)/);
    expect(OPENER).toMatch(/method="post"\s+action="\/receipt\/open"/);
    expect(OPENER).toMatch(/type="hidden" name="token"/);
  });

  it("the token is cleared from the form field right after each submit", () => {
    expect(OPENER).toMatch(/formRef\.current\?\.submit\(\);\s*\n(\s*\/\/.*\n)?\s*input\.value = "";/);
  });

  it("no analytics or third-party script runs on /receipt", () => {
    expect(isAnalyticsExcludedPath("/receipt")).toBe(true);
    expect(isAnalyticsExcludedPath("/receipt/open")).toBe(true);
    expect(isAnalyticsExcludedPath("/receipts")).toBe(false);
    expect(isAnalyticsExcludedPath("/event/evt-1")).toBe(false);
    expect(isAnalyticsExcludedPath(null)).toBe(false);
    const scripts = readFileSync(join(ROOT, "components/analytics/analytics-scripts.tsx"), "utf8");
    const body = scripts.slice(scripts.indexOf("return ("));
    expect(body.trimStart()).toMatch(/^return \(\s*<AnalyticsRouteGate>/);
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    expect(layout.match(/<Script\b|<script\b/g) ?? []).toHaveLength(0);
  });
});
