/**
 * Every export of a "use server" module is a public endpoint: Next.js
 * assigns it an action id and any browser can POST to it. Hidden ids are
 * not a security boundary, so trusted internals must live in modules that
 * import "server-only" and are never exported from a "use server" file.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function isUseServerModule(src: string): boolean {
  const withoutComments = src.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
  return /^["']use server["'];?/.test(withoutComments.trimStart());
}

function exportedNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("type ")) continue;
      const alias = trimmed.split(/\s+as\s+/).pop()!.trim();
      names.add(alias);
    }
  }
  return [...names];
}

const useServerFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).filter((f) =>
  isUseServerModule(readFileSync(f, "utf8")),
);

const exportsByFile = new Map(
  useServerFiles.map((f) => [relative(ROOT, f), exportedNames(readFileSync(f, "utf8"))]),
);

/** Functions that trust their arguments and must never be browser-callable. */
const INTERNAL_ONLY = [
  // Stripe / purchase fulfilment
  "fulfillStripeCheckout",
  "fulfillExistingSubscriptionPayment",
  "createPurchaseSubscription",
  "validateAndPreparePurchase",
  "fulfillGuestEventPurchase",
  "fulfillEventPurchase",
  "fulfillPendingEventPurchase",
  "routeStripeSessionFulfillment",
  "applyPendingReferralForPurchase",
  "sendPaymentConfirmationEmail",
  // Lifecycle
  "runTermLifecycle",
  "lazyExpireSubscriptions",
  // Identity / staff
  "acceptStaffInviteOnSignInAction",
  "acceptPendingStaffInviteForUser",
  "ensureSupabaseProfile",
  // Lookups that trusted caller identifiers
  "eventQrLookup",
  "lookupStudentByQr",
  "validateRestoreEntitlement",
  "getCodeOfConductStatus",
  "ensureMyReferralCodeAction",
];

describe("Server Action surface", () => {
  it("finds the use-server modules (sanity)", () => {
    expect(useServerFiles.length).toBeGreaterThan(30);
    expect(exportsByFile.get("lib/actions/stripe-checkout.ts")).toContain("createStripeCheckoutAction");
  });

  it.each(INTERNAL_ONLY)("%s is not exported from any 'use server' module", (name) => {
    const offenders = [...exportsByFile.entries()]
      .filter(([, names]) => names.includes(name))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("runTermLifecycleAction takes no trigger argument", () => {
    const src = readFileSync(join(ROOT, "lib/actions/term-lifecycle.ts"), "utf8");
    expect(src).toMatch(/export async function runTermLifecycleAction\(\)/);
    expect(src).not.toMatch(/LifecycleTrigger/);
  });

  it.each([
    "lib/services/stripe-fulfillment.ts",
    "lib/services/stripe-fulfillment-router.ts",
    "lib/services/purchase-subscription.ts",
    "lib/services/event-purchase-fulfillment.ts",
    "lib/services/event-payment-email.ts",
    "lib/services/referral-application.ts",
    "lib/services/term-lifecycle-service.ts",
    "lib/services/restore-entitlement.ts",
    "lib/staff-invite-acceptance.ts",
  ])("%s is server-only and not a Server Action module", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(src).toMatch(/^import "server-only";/m);
    expect(isUseServerModule(src)).toBe(false);
  });
});
