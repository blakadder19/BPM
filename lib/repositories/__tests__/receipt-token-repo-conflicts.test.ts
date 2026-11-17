/**
 * The Supabase token repository treats a violation of the one-active-token
 * index as "a link already exists" (no throw, nothing revoked) and every
 * other database error as a failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));

vi.mock("@/lib/supabase/admin", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["insert", "update", "select", "eq", "is", "not", "in"]) chain[m] = () => chain;
  chain.single = async () => h.result;
  chain.then = (resolve: (v: unknown) => void) => resolve(h.result);
  return { createAdminClient: () => ({ from: () => chain }) };
});

import { supabaseReceiptTokenRepo } from "../supabase/receipt-token-repository";

const input = {
  eventPurchaseId: "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d",
  tokenHash: "a".repeat(64),
  issuedReason: "purchase_email" as const,
  createdBy: null,
  expiresAt: null,
};

const ONE_ACTIVE = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "receipt_access_tokens_one_active_per_purchase"',
};

beforeEach(() => {
  h.result = { data: null, error: null };
});

describe("supabaseReceiptTokenRepo conflicts", () => {
  it("insertIfNoActive returns null when an active token already exists", async () => {
    h.result = { data: null, error: ONE_ACTIVE };
    expect(await supabaseReceiptTokenRepo.insertIfNoActive(input)).toBeNull();
  });

  it("insertIfNoActive throws on any other error, including a token-hash collision", async () => {
    h.result = { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "receipt_access_tokens_token_hash_key"' } };
    await expect(supabaseReceiptTokenRepo.insertIfNoActive(input)).rejects.toThrow();
    h.result = { data: null, error: { code: "57014", message: "timeout" } };
    await expect(supabaseReceiptTokenRepo.insertIfNoActive(input)).rejects.toThrow();
  });

  it("reinstate reports false when another link became active meanwhile", async () => {
    h.result = { data: null, error: ONE_ACTIVE };
    expect(await supabaseReceiptTokenRepo.reinstate("tok-1")).toBe(false);
    h.result = { data: [{ id: "tok-1" }], error: null };
    expect(await supabaseReceiptTokenRepo.reinstate("tok-1")).toBe(true);
  });
});
