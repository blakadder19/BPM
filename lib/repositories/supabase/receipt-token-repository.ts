import { createAdminClient } from "@/lib/supabase/admin";
import type { ReceiptTokenIssueReason, ReceiptTokenRecord } from "@/lib/domain/receipt-token";
import type { IReceiptTokenRepository } from "../interfaces/receipt-token-repository";

/**
 * `receipt_access_tokens` (migration 00082). RLS is on with no policies,
 * so only the service-role client used here can read or write it.
 */

interface TokenRow {
  id: string;
  event_purchase_id: string;
  token_hash: string;
  issued_reason: ReceiptTokenIssueReason;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

function toRecord(r: TokenRow): ReceiptTokenRecord {
  return {
    id: r.id,
    eventPurchaseId: r.event_purchase_id,
    tokenHash: r.token_hash,
    issuedReason: r.issued_reason,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    lastUsedAt: r.last_used_at,
  };
}

const COLUMNS =
  "id, event_purchase_id, token_hash, issued_reason, created_by, created_at, expires_at, revoked_at, last_used_at";

const ONE_ACTIVE_INDEX = "receipt_access_tokens_one_active_per_purchase";

function isOneActiveConflict(error: { code?: string; message?: string; details?: string }): boolean {
  return error.code === "23505" && `${error.message ?? ""} ${error.details ?? ""}`.includes(ONE_ACTIVE_INDEX);
}

function tokens() {
  return createAdminClient().from("receipt_access_tokens" as never);
}

export const supabaseReceiptTokenRepo: IReceiptTokenRepository = {
  async rotateForEventPurchase(input) {
    // Revoke + insert run inside one Postgres function so a concurrent
    // resend can never leave two active tokens (also backstopped by the
    // partial unique index on active tokens).
    const { data, error } = await createAdminClient().rpc("rotate_receipt_access_token" as never, {
      p_event_purchase_id: input.eventPurchaseId,
      p_token_hash: input.tokenHash,
      p_issued_reason: input.issuedReason,
      p_created_by: input.createdBy,
      p_expires_at: input.expiresAt,
    } as never);
    if (error) throw new Error(`Failed to issue receipt token: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as TokenRow | null;
    if (!row) throw new Error("Failed to issue receipt token: no row returned.");
    return toRecord(row);
  },

  async insertIfNoActive(input) {
    const { data, error } = await tokens()
      .insert({
        event_purchase_id: input.eventPurchaseId,
        token_hash: input.tokenHash,
        issued_reason: input.issuedReason,
        created_by: input.createdBy,
        expires_at: input.expiresAt,
      } as never)
      .select(COLUMNS)
      .single();
    if (error) {
      if (isOneActiveConflict(error)) return null;
      throw new Error(`Failed to issue receipt token: ${error.message}`);
    }
    return toRecord(data as unknown as TokenRow);
  },

  async findByHash(tokenHash) {
    const { data, error } = await tokens().select(COLUMNS).eq("token_hash", tokenHash).maybeSingle();
    if (error) throw new Error(`Failed to look up receipt token: ${error.message}`);
    return data ? toRecord(data as unknown as TokenRow) : null;
  },

  async findActiveForEventPurchase(eventPurchaseId) {
    const { data, error } = await tokens()
      .select(COLUMNS)
      .eq("event_purchase_id", eventPurchaseId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw new Error(`Failed to look up receipt token: ${error.message}`);
    return data ? toRecord(data as unknown as TokenRow) : null;
  },

  async listPurchasesWithActiveToken(eventPurchaseIds) {
    if (eventPurchaseIds.length === 0) return new Set();
    const { data, error } = await tokens()
      .select("event_purchase_id")
      .in("event_purchase_id", [...eventPurchaseIds])
      .is("revoked_at", null);
    if (error) throw new Error(`Failed to list receipt tokens: ${error.message}`);
    return new Set(((data ?? []) as unknown as { event_purchase_id: string }[]).map((r) => r.event_purchase_id));
  },

  async revokeById(id, atIso) {
    const { error } = await tokens()
      .update({ revoked_at: atIso } as never)
      .eq("id", id)
      .is("revoked_at", null);
    if (error) throw new Error(`Failed to revoke receipt token: ${error.message}`);
  },

  async reinstate(id) {
    const { data, error } = await tokens()
      .update({ revoked_at: null } as never)
      .eq("id", id)
      .not("revoked_at", "is", null)
      .select("id");
    if (error) {
      if (isOneActiveConflict(error)) return false;
      throw new Error(`Failed to restore receipt token: ${error.message}`);
    }
    return ((data as unknown[] | null)?.length ?? 0) > 0;
  },

  async revokeAllForEventPurchase(eventPurchaseId) {
    const { data, error } = await tokens()
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("event_purchase_id", eventPurchaseId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw new Error(`Failed to revoke receipt tokens: ${error.message}`);
    return (data as unknown[] | null)?.length ?? 0;
  },

  async touchLastUsed(id, atIso) {
    const { error } = await tokens()
      .update({ last_used_at: atIso } as never)
      .eq("id", id);
    if (error) throw new Error(`Failed to record receipt token use: ${error.message}`);
  },
};
