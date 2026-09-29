/**
 * Audit persistence must be honest and idempotent.
 *
 * Background: `saveAuditEntryToDB` swallowed every error, so a write
 * rejected by Postgres — which is what happened in production for
 * five months, because migration 00047 was never applied and the row
 * named four columns that did not exist — left the caller reporting a
 * fully audited success with no row in the table.
 *
 * Properties pinned here:
 *   (a) a failed write is reported as failed, is NOT visible in the
 *       in-memory log, and the caller does not retry the credit
 *       consumption to compensate;
 *   (b) repeating the operation (or recovering it) writes ONE entry,
 *       because the id is derived from the work, not from a clock;
 *   (c) two distinct corrections never share an id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveAuditEntryToDB = vi.fn();
const memoryMode = { value: false };

vi.mock("@/lib/supabase/operational-persistence", () => ({
  saveAuditEntryToDB: (...args: unknown[]) => saveAuditEntryToDB(...args),
}));
vi.mock("@/lib/config/data-provider", () => ({
  isMemoryMode: () => memoryMode.value,
}));
vi.mock("server-only", () => ({}));

import {
  logFinanceEventAwaited,
  getAuditLog,
  getPendingAuditEntry,
  retryPendingAuditEntry,
} from "@/lib/services/finance-audit-log";
import { backdateAuditEntryId } from "@/lib/domain/audit-entry-id";
import {
  isBackdatedCorrectionRecord,
  BACKDATE_ATTENDANCE_NOTE_PREFIX,
} from "@/lib/domain/backdated-attendance";

const g = globalThis as unknown as {
  __bpm_finance_audit?: unknown[];
  __bpmPendingAudit?: Map<string, unknown>;
};

const MARKED_AT = "2026-09-29T14:10:56.759Z";

const PARAMS = {
  entityType: "subscription" as const,
  entityId: "sub-1",
  action: "manual_edit" as const,
  performer: { userId: "admin-1", email: "admin@bpm.dance", name: "BPM Admin" },
  detail: "Backdated attendance correction",
  newValue: "present",
};

beforeEach(() => {
  g.__bpm_finance_audit = [];
  g.__bpmPendingAudit = new Map();
  memoryMode.value = false;
  saveAuditEntryToDB.mockReset();
});

describe("audit write failure is surfaced, not swallowed", () => {
  it("reports persisted:false when Postgres rejects the row", async () => {
    saveAuditEntryToDB.mockResolvedValue({
      persisted: false,
      error: "Could not find the 'performed_at' column",
    });

    const r = await logFinanceEventAwaited(PARAMS);

    expect(r.persisted).toBe(false);
    expect(r.error).toContain("performed_at");
  });

  it("reports persisted:false when the write throws", async () => {
    saveAuditEntryToDB.mockRejectedValue(new Error("network down"));

    const r = await logFinanceEventAwaited(PARAMS);

    expect(r.persisted).toBe(false);
    expect(r.error).toBe("network down");
  });

  it("attempts the write exactly once — a failure must not re-run the operation", async () => {
    // The booking, attendance and credit are already committed by the
    // time the audit is written. Retrying here would be retrying the
    // whole correction, which is how a second credit gets taken.
    saveAuditEntryToDB.mockResolvedValue({ persisted: false, error: "boom" });

    await logFinanceEventAwaited(PARAMS);

    expect(saveAuditEntryToDB).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed entry out of the log, so the log never claims a row the DB lacks", async () => {
    saveAuditEntryToDB.mockResolvedValue({ persisted: false, error: "boom" });

    const r = await logFinanceEventAwaited({ ...PARAMS, entryId: "fal-x" });

    expect(getAuditLog()).toHaveLength(0);
    expect(getPendingAuditEntry("fal-x")).toEqual(r.entry);
  });

  it("flags a degraded write as persisted but incomplete", async () => {
    saveAuditEntryToDB.mockResolvedValue({ persisted: true, degraded: true });

    const r = await logFinanceEventAwaited(PARAMS);

    expect(r.persisted).toBe(true);
    expect(r.degraded).toBe(true);
    expect(getAuditLog()).toHaveLength(1);
  });

  it("reports a clean success plainly", async () => {
    saveAuditEntryToDB.mockResolvedValue({ persisted: true });

    const r = await logFinanceEventAwaited(PARAMS);

    expect(r.persisted).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.error).toBeUndefined();
  });

  it("treats the in-memory log as the store of record in memory mode", async () => {
    memoryMode.value = true;

    const r = await logFinanceEventAwaited(PARAMS);

    expect(r.persisted).toBe(true);
    expect(saveAuditEntryToDB).not.toHaveBeenCalled();
    expect(getAuditLog()).toHaveLength(1);
  });
});

describe("repeated operation produces exactly one audit entry", () => {
  const entryId = backdateAuditEntryId("booking-1", "att-1", MARKED_AT);

  it("keeps one entry when the same entryId is written twice", async () => {
    saveAuditEntryToDB.mockResolvedValue({ persisted: true });

    await logFinanceEventAwaited({ ...PARAMS, entryId });
    await logFinanceEventAwaited({ ...PARAMS, entryId });

    expect(getAuditLog().filter((e) => e.id === entryId)).toHaveLength(1);
    expect(getAuditLog()).toHaveLength(1);
  });

  it("recovers a failed write by re-writing the ORIGINAL entry, once", async () => {
    saveAuditEntryToDB.mockResolvedValueOnce({ persisted: false, error: "boom" });
    const first = await logFinanceEventAwaited({ ...PARAMS, entryId });
    expect(first.persisted).toBe(false);

    saveAuditEntryToDB.mockResolvedValueOnce({ persisted: true });
    const retry = await retryPendingAuditEntry(entryId);

    expect(retry?.persisted).toBe(true);
    // Same actor, detail and timestamp as the correction itself — not
    // a reconstruction attributed to whoever pressed "retry".
    expect(retry?.entry).toEqual(first.entry);
    expect(getAuditLog()).toHaveLength(1);
    expect(getAuditLog()[0].id).toBe(entryId);
    expect(getPendingAuditEntry(entryId)).toBeUndefined();
  });

  it("has nothing to retry when no write failed", async () => {
    expect(await retryPendingAuditEntry(entryId)).toBeNull();
    expect(saveAuditEntryToDB).not.toHaveBeenCalled();
  });

  it("still gives independent events distinct ids", async () => {
    saveAuditEntryToDB.mockResolvedValue({ persisted: true });

    await logFinanceEventAwaited({
      ...PARAMS,
      entryId: backdateAuditEntryId("booking-1", "att-1", MARKED_AT),
    });
    await logFinanceEventAwaited({
      ...PARAMS,
      entryId: backdateAuditEntryId("booking-2", "att-2", MARKED_AT),
    });

    expect(getAuditLog()).toHaveLength(2);
  });

  it("keeps both entries when the same booking is corrected twice", async () => {
    // Corrected, later marked absent, corrected again: same booking and
    // attendance row, but a new markedAt. Sharing an id here would let
    // the upsert erase the first correction's audit entry.
    saveAuditEntryToDB.mockResolvedValue({ persisted: true });

    await logFinanceEventAwaited({
      ...PARAMS,
      entryId: backdateAuditEntryId("booking-1", "att-1", "2026-09-29T14:10:56.759Z"),
    });
    await logFinanceEventAwaited({
      ...PARAMS,
      entryId: backdateAuditEntryId("booking-1", "att-1", "2026-10-02T09:00:00.000Z"),
    });

    expect(getAuditLog()).toHaveLength(2);
  });
});

describe("backdateAuditEntryId", () => {
  it("is stable for the same correction", () => {
    expect(backdateAuditEntryId("b-1", "att-1", MARKED_AT)).toBe(
      backdateAuditEntryId("b-1", "att-1", MARKED_AT),
    );
  });

  it("differs when any component differs, including swapped inputs", () => {
    const base = backdateAuditEntryId("b-1", "att-1", MARKED_AT);
    expect(backdateAuditEntryId("b-2", "att-1", MARKED_AT)).not.toBe(base);
    expect(backdateAuditEntryId("b-1", "att-2", MARKED_AT)).not.toBe(base);
    expect(backdateAuditEntryId("b-1", "att-1", "2026-09-29T14:10:56.760Z")).not.toBe(base);
    expect(backdateAuditEntryId("a", "b", "c")).not.toBe(backdateAuditEntryId("b", "a", "c"));
  });

  it("carries a recognisable prefix so recovery rows are greppable", () => {
    expect(backdateAuditEntryId("b-1", "att-1", MARKED_AT)).toMatch(/^fal-bd-/);
  });

  it("cannot be forged by shifting a separator between inputs", () => {
    expect(backdateAuditEntryId("a|b", "c", "d")).not.toBe(backdateAuditEntryId("a", "b|c", "d"));
    expect(backdateAuditEntryId("a:b", "c", "d")).not.toBe(backdateAuditEntryId("a", "b:c", "d"));
    expect(backdateAuditEntryId("a", "b", "1:c")).not.toBe(backdateAuditEntryId("a", "b1:", "c"));
    expect(backdateAuditEntryId("", "abc", "")).not.toBe(backdateAuditEntryId("abc", "", ""));
  });

  it("is injective across a large adversarial set — no collisions", () => {
    const fragments = ["", "a", "|", ":", "1:", "a|b", "3:a", "b-1"];
    const seen = new Map<string, string>();
    for (const x of fragments) {
      for (const y of fragments) {
        for (const z of fragments) {
          const id = backdateAuditEntryId(x, y, z);
          const triple = JSON.stringify([x, y, z]);
          expect(seen.has(id), `collision: ${triple} vs ${seen.get(id)}`).toBe(false);
          seen.set(id, triple);
        }
      }
    }
    expect(seen.size).toBe(fragments.length ** 3);
  });

  it("stays reasonable for a text primary key with real ids", () => {
    const id = backdateAuditEntryId("b-1790691054335-1c1q", "att-1790691056759-eigd", MARKED_AT);
    expect(id.length).toBeLessThan(120);
    expect(id).toContain("b-1790691054335-1c1q");
  });
});

describe("isBackdatedCorrectionRecord", () => {
  it("recognises rows written by a correction", () => {
    expect(isBackdatedCorrectionRecord({ notes: `${BACKDATE_ATTENDANCE_NOTE_PREFIX}Robin attended` })).toBe(true);
  });

  it("rejects ordinary check-ins, so no audit is ever minted for them", () => {
    expect(isBackdatedCorrectionRecord({ notes: null })).toBe(false);
    expect(isBackdatedCorrectionRecord({ notes: "Walk-in check-in via QR scan" })).toBe(false);
    expect(isBackdatedCorrectionRecord({})).toBe(false);
  });
});
