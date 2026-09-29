/**
 * `saveAuditEntryToDB` against a schema that skipped migration 00047.
 *
 * Production ran for five months with `op_finance_audit_log` missing
 * performed_by_user_id / performed_by_email / performed_by_name /
 * performed_at. PostgREST rejected the whole row with PGRST204 and
 * the error was swallowed, so every audit write was lost silently.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));
vi.mock("server-only", () => ({}));

import { saveAuditEntryToDB } from "@/lib/supabase/operational-persistence";
import type { FinanceAuditEntry } from "@/lib/services/finance-audit-log";

const ENTRY: FinanceAuditEntry = {
  id: "fal-bd-deadbeef",
  entityType: "subscription",
  entityId: "sub-1",
  action: "manual_edit",
  performedBy: "BPM Admin",
  performedByUserId: "admin-1",
  performedByEmail: "admin@bpm.dance",
  performedByName: "BPM Admin",
  performedAt: "2026-09-29T14:10:56.900Z",
  detail: "Backdated attendance correction",
  previousValue: null,
  newValue: "present",
  metadata: { backdatedAttendance: { bookingId: "b-1" } },
  createdAt: "2026-09-29T14:10:56.900Z",
};

const MISSING_COLUMN = {
  code: "PGRST204",
  message: "Could not find the 'performed_at' column of 'op_finance_audit_log' in the schema cache",
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  upsert.mockReset();
  from.mockClear();
});

describe("saveAuditEntryToDB", () => {
  it("reports success on a clean write", async () => {
    upsert.mockResolvedValue({ error: null });

    const r = await saveAuditEntryToDB(ENTRY);

    expect(r).toEqual({ persisted: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("inserts only if absent, so a recovery neither duplicates nor overwrites the row", async () => {
    upsert.mockResolvedValue({ error: null });

    await saveAuditEntryToDB(ENTRY);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fal-bd-deadbeef" }),
      { onConflict: "id", ignoreDuplicates: true },
    );
  });

  it("never overwrites on the degraded retry either", async () => {
    upsert
      .mockResolvedValueOnce({ error: MISSING_COLUMN })
      .mockResolvedValueOnce({ error: null });

    await saveAuditEntryToDB(ENTRY);

    expect(upsert.mock.calls[1][1]).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("retries without the identity columns when the schema lacks them", async () => {
    upsert
      .mockResolvedValueOnce({ error: MISSING_COLUMN })
      .mockResolvedValueOnce({ error: null });

    const r = await saveAuditEntryToDB(ENTRY);

    expect(r.persisted).toBe(true);
    expect(r.degraded).toBe(true);

    // The entry survives; only the structured performer fields are
    // dropped. `performed_by` still names the actor.
    const [legacyRow] = upsert.mock.calls[1];
    expect(legacyRow).not.toHaveProperty("performed_at");
    expect(legacyRow).not.toHaveProperty("performed_by_user_id");
    expect(legacyRow).not.toHaveProperty("performed_by_email");
    expect(legacyRow).not.toHaveProperty("performed_by_name");
    expect(legacyRow.performed_by).toBe("BPM Admin");
    expect(legacyRow.detail).toBe("Backdated attendance correction");
    expect(legacyRow.metadata).toEqual(ENTRY.metadata);
  });

  it("does not mask a genuine failure as a degraded success", async () => {
    upsert.mockResolvedValue({ error: { code: "23505", message: "duplicate key value" } });

    const r = await saveAuditEntryToDB(ENTRY);

    expect(r.persisted).toBe(false);
    expect(r.error).toContain("duplicate key");
    // A non-schema error must not trigger the legacy retry.
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("reports failure when even the degraded write is rejected", async () => {
    upsert
      .mockResolvedValueOnce({ error: MISSING_COLUMN })
      .mockResolvedValueOnce({ error: { message: "permission denied" } });

    const r = await saveAuditEntryToDB(ENTRY);

    expect(r.persisted).toBe(false);
    expect(r.error).toBe("permission denied");
  });

  it("reports failure instead of throwing when the client blows up", async () => {
    upsert.mockRejectedValue(new Error("socket hang up"));

    const r = await saveAuditEntryToDB(ENTRY);

    expect(r.persisted).toBe(false);
    expect(r.error).toBe("socket hang up");
  });
});
