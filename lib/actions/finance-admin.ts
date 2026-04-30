"use server";

/**
 * Super-admin only finance test data deletion (narrow + explicit).
 *
 * See `lib/domain/finance-admin.ts` for constants and types shared with UI.
 *
 * Design (G5 — narrowed):
 *   Broad filters like "manual payment method" are NOT a test signal on their
 *   own (real reception payments are also cash/revolut/etc.), and wiping every
 *   penalty is destructive. Deletion is therefore restricted to records that
 *   carry an explicit test marker AND that the super-admin explicitly picks
 *   from a candidate list.
 *
 * Gates (all must pass):
 *   - env `BPM_ALLOW_FINANCE_TEST_DELETE === "true"`
 *   - env `BPM_SUPER_ADMIN_EMAIL` matches authenticated admin's email
 *   - caller types the confirmation token `DELETE TEST DATA`
 *   - caller provides a non-empty list of record ids
 *   - EVERY provided id must still match the test-marker predicate at the
 *     moment of deletion (re-checked server-side; UI selection is advisory)
 *
 * Test-marker predicate:
 *   A record qualifies as test data only when any of the following text fields
 *   contains one of the explicit markers `[test]`, `#test`, or `TEST:`
 *   (case-insensitive):
 *     - subscription:    paymentNotes, notes, paymentReference, refundReason
 *     - penalty:         notes
 *     - event_purchase:  notes, paymentReference, refundReason
 *
 * Tables affected:
 *   - `subscriptions`     (repo delete) — in-memory + Supabase when configured
 *   - `penalties`         (in-memory) + `op_penalty` (Supabase) via deletePenaltyFromDB
 *   - `event_purchases`   (repo delete) — in-memory + Supabase when configured
 *   - `op_finance_audit_log` gets one `manual_edit` entry per mark / unmark / delete
 *
 * Event purchases were previously excluded from this flow. They are now
 * supported with the SAME safety model: explicit marker required, explicit
 * row selection in the UI, server-side marker re-check at delete time,
 * env flag + super-admin email gates, typed confirmation token.
 */

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getStaffAccess } from "@/lib/staff-permissions";
import { getSubscriptionRepo } from "@/lib/repositories";
import { getSpecialEventRepo } from "@/lib/repositories";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import { invalidateHydration } from "@/lib/supabase/hydrate-operational";
import {
  deletePenaltyFromDB,
  updatePenaltyInDB,
} from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import {
  FINANCE_TEST_DELETE_CONFIRMATION,
  FINANCE_TEST_MARKER,
  FINANCE_TEST_MARKERS_RECOGNISED,
  type FinanceSuperAdminStatus,
  type FinanceTestCandidate,
  type ListFinanceTestCandidatesResult,
  type DeleteFinanceTestResult,
  type MarkFinanceTestResult,
  type FinanceMarkableSource,
} from "@/lib/domain/finance-admin";

/** Explicit markers a record must carry to qualify as test data. */
const TEST_MARKERS = FINANCE_TEST_MARKERS_RECOGNISED;

function hasTestMarker(...fields: (string | null | undefined)[]): boolean {
  for (const f of fields) {
    if (!f) continue;
    const lower = f.toLowerCase();
    for (const m of TEST_MARKERS) {
      if (lower.includes(m)) return true;
    }
  }
  return false;
}

/** Append the canonical marker if no recognised marker is already present. */
function withMarker(field: string | null | undefined): string {
  const trimmed = (field ?? "").trim();
  if (hasTestMarker(trimmed)) return trimmed;
  return trimmed.length === 0 ? FINANCE_TEST_MARKER : `${trimmed} ${FINANCE_TEST_MARKER}`;
}

/**
 * Strip every recognised marker from a free-text field. Collapses any
 * resulting double spaces and trims; returns null when nothing meaningful
 * remains (so we don't leave behind an empty string).
 */
function withoutMarker(field: string | null | undefined): string | null {
  if (!field) return null;
  let out = field;
  // Order matters: longest first so "TEST:" doesn't get partially shadowed.
  for (const m of ["[test]", "#test", "test:"]) {
    const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  out = out.replace(/\s{2,}/g, " ").trim();
  return out.length === 0 ? null : out;
}

/** Parse "sub-<id>" / "pen-<id>" / "evt-<id>" produced by FinanceTransaction.id. */
function parseTransactionId(transactionId: string): {
  source: FinanceMarkableSource;
  recordId: string;
} | null {
  if (transactionId.startsWith("sub-")) {
    return { source: "subscription", recordId: transactionId.slice(4) };
  }
  if (transactionId.startsWith("pen-")) {
    return { source: "penalty", recordId: transactionId.slice(4) };
  }
  if (transactionId.startsWith("evt-")) {
    return { source: "event_purchase", recordId: transactionId.slice(4) };
  }
  return null;
}

/**
 * Server-side check used by the Finance page to decide whether to render the
 * danger zone. Returns all-false when gates do not pass.
 */
export async function getFinanceSuperAdminStatus(): Promise<FinanceSuperAdminStatus> {
  const user = await getAuthUser();
  const access = user ? await getStaffAccess() : null;
  const superEmail = (process.env.BPM_SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const envEnabled = process.env.BPM_ALLOW_FINANCE_TEST_DELETE === "true";
  // Permission-aware: must be a real Super Admin in the RBAC sense AND match the
  // configured BPM_SUPER_ADMIN_EMAIL. Legacy users.role='admin' alone is no
  // longer enough — staff with custom/teacher roles cannot reach this even if
  // their email happens to match.
  const isSuperAdmin = !!(
    user &&
    access?.isSuperAdmin &&
    superEmail.length > 0 &&
    user.email.toLowerCase().trim() === superEmail
  );
  return {
    isSuperAdmin,
    envEnabled,
    canDelete: isSuperAdmin && envEnabled,
  };
}

/**
 * Return every subscription / penalty / event-purchase record that currently
 * carries an explicit test marker. The super-admin must explicitly select
 * from this list before deletion.
 */
export async function listFinanceTestCandidatesAction(): Promise<ListFinanceTestCandidatesResult> {
  const status = await getFinanceSuperAdminStatus();
  if (!status.envEnabled) {
    return { success: false, error: "Test data deletion is not enabled in this environment." };
  }
  if (!status.isSuperAdmin) {
    return { success: false, error: "Not authorized." };
  }

  const candidates: FinanceTestCandidate[] = [];

  const subRepo = getSubscriptionRepo();
  const subs = await subRepo.getAll();
  for (const s of subs) {
    if (!hasTestMarker(s.paymentNotes, s.notes, s.paymentReference, s.refundReason)) continue;
    const detailParts = [
      s.paymentMethod ?? null,
      s.paymentStatus ?? null,
      s.paymentNotes ?? s.notes ?? null,
    ].filter(Boolean) as string[];
    candidates.push({
      kind: "subscription",
      id: s.id,
      label: `${s.productName} — ${s.studentId}`,
      detail: detailParts.join(" · ") || null,
      createdAt: s.assignedAt ?? s.paidAt ?? null,
    });
  }

  const penaltySvc = getPenaltyService();
  for (const p of penaltySvc.getAllPenalties()) {
    if (!hasTestMarker(p.notes)) continue;
    candidates.push({
      kind: "penalty",
      id: p.id,
      label: `${p.reason === "late_cancel" ? "Late cancel" : "No-show"} — ${p.classTitle}`,
      detail: p.notes,
      createdAt: p.createdAt,
    });
  }

  // Event purchases — only rows whose notes/reference/refundReason carry an
  // explicit marker. The repo call is inside try/catch because the events
  // module is optional in some deployments.
  try {
    const eventRepo = getSpecialEventRepo();
    const purchases = await eventRepo.getAllPurchases();
    for (const p of purchases) {
      if (!hasTestMarker(p.notes, p.paymentReference, p.refundReason)) continue;
      const buyer = p.guestName ?? p.guestEmail ?? p.studentId ?? "Unknown buyer";
      const detailParts = [
        p.productNameSnapshot ?? null,
        p.paymentMethod ?? null,
        p.paymentStatus ?? null,
        p.notes ?? null,
      ].filter(Boolean) as string[];
      candidates.push({
        kind: "event_purchase",
        id: p.id,
        label: `${p.productNameSnapshot ?? "Event purchase"} — ${buyer}`,
        detail: detailParts.join(" · ") || null,
        createdAt: p.purchasedAt ?? p.paidAt ?? null,
      });
    }
  } catch {
    // Event module not active in this environment — skip silently.
  }

  candidates.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return { success: true, candidates };
}

export async function deleteFinanceTestRecordsAction(input: {
  confirmation: string;
  ids: string[];
}): Promise<DeleteFinanceTestResult> {
  const status = await getFinanceSuperAdminStatus();
  if (!status.envEnabled) {
    return { success: false, error: "Test data deletion is not enabled in this environment." };
  }
  if (!status.isSuperAdmin) {
    return { success: false, error: "Not authorized." };
  }
  if (input.confirmation !== FINANCE_TEST_DELETE_CONFIRMATION) {
    return { success: false, error: `Type ${FINANCE_TEST_DELETE_CONFIRMATION} to confirm.` };
  }
  const ids = (input.ids ?? []).filter((x) => typeof x === "string" && x.length > 0);
  if (ids.length === 0) {
    return { success: false, error: "No records selected." };
  }
  const idSet = new Set(ids);

  const user = await getAuthUser();
  const performer = user
    ? { userId: user.id, email: user.email, name: user.fullName }
    : null;

  let deletedSubscriptions = 0;
  let deletedPenalties = 0;
  let deletedEventPurchases = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];

  // ── Subscriptions (re-check marker) ──────────────────────
  const subRepo = getSubscriptionRepo();
  const allSubs = await subRepo.getAll();
  for (const s of allSubs) {
    if (!idSet.has(s.id)) continue;
    if (!hasTestMarker(s.paymentNotes, s.notes, s.paymentReference, s.refundReason)) {
      skipped++;
      skippedReasons.push(`${s.id}: no longer carries a test marker`);
      continue;
    }
    try {
      const ok = await subRepo.delete(s.id);
      if (ok) {
        deletedSubscriptions++;
        logFinanceEvent({
          entityType: "subscription",
          entityId: s.id,
          action: "manual_edit",
          performer,
          detail: "Super-admin test data deletion (explicit selection)",
          previousValue: s.paymentStatus,
          newValue: "deleted",
        });
      } else {
        skipped++;
        skippedReasons.push(`${s.id}: repository delete returned false`);
      }
    } catch (e) {
      skipped++;
      skippedReasons.push(`${s.id}: ${e instanceof Error ? e.message : "delete error"}`);
    }
  }

  // ── Penalties (re-check marker) ──────────────────────────
  const penaltySvc = getPenaltyService();
  const allPenalties = penaltySvc.getAllPenalties();
  for (const p of allPenalties) {
    if (!idSet.has(p.id)) continue;
    if (!hasTestMarker(p.notes)) {
      skipped++;
      skippedReasons.push(`${p.id}: no longer carries a test marker`);
      continue;
    }
    const ok = penaltySvc.deletePenalty(p.id);
    if (!ok) {
      skipped++;
      skippedReasons.push(`${p.id}: penalty not found in memory`);
      continue;
    }
    deletedPenalties++;
    if (isRealUser(p.studentId)) {
      try { await deletePenaltyFromDB(p.id); } catch { /* best-effort */ }
    }
    logFinanceEvent({
      entityType: "penalty",
      entityId: p.id,
      action: "manual_edit",
      performer,
      detail: "Super-admin test data deletion (explicit selection)",
      previousValue: p.resolution,
      newValue: "deleted",
    });
  }

  // ── Event purchases (re-check marker) ────────────────────
  try {
    const eventRepo = getSpecialEventRepo();
    const allPurchases = await eventRepo.getAllPurchases();
    for (const ep of allPurchases) {
      if (!idSet.has(ep.id)) continue;
      if (!hasTestMarker(ep.notes, ep.paymentReference, ep.refundReason)) {
        skipped++;
        skippedReasons.push(`${ep.id}: no longer carries a test marker`);
        continue;
      }
      try {
        const ok = await eventRepo.deletePurchase(ep.id);
        if (ok) {
          deletedEventPurchases++;
          logFinanceEvent({
            entityType: "event_purchase",
            entityId: ep.id,
            action: "manual_edit",
            performer,
            detail: "Super-admin test data deletion (explicit selection)",
            previousValue: ep.paymentStatus,
            newValue: "deleted",
          });
        } else {
          skipped++;
          skippedReasons.push(`${ep.id}: repository delete returned false`);
        }
      } catch (e) {
        skipped++;
        skippedReasons.push(`${ep.id}: ${e instanceof Error ? e.message : "delete error"}`);
      }
    }
  } catch {
    // Event module not active in this environment — nothing to delete.
  }

  invalidateHydration();
  revalidatePath("/finance");
  revalidatePath("/penalties");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/events");

  return {
    success: true,
    deletedSubscriptions,
    deletedPenalties,
    deletedEventPurchases,
    skipped,
    skippedReasons: skippedReasons.length > 0 ? skippedReasons : undefined,
  };
}

/**
 * Toggle the `[test]` marker on a finance row.
 *
 * Marker location per source:
 *   - subscription:    `paymentNotes` (canonical free-text notes column)
 *   - penalty:         `notes`
 *   - event_purchase:  `notes`
 *
 * On unmark, every text field that may have historically held a marker is
 * scrubbed so the row stops appearing in the candidate scan:
 *   - subscription:    paymentNotes, notes, paymentReference, refundReason
 *   - penalty:         notes
 *   - event_purchase:  notes, paymentReference, refundReason
 *
 * Same gates as the rest of the danger zone:
 *   - `BPM_ALLOW_FINANCE_TEST_DELETE === "true"`
 *   - authenticated admin's email matches `BPM_SUPER_ADMIN_EMAIL`
 */
export async function toggleFinanceTestMarkerAction(input: {
  transactionId: string;
  mark: boolean;
}): Promise<MarkFinanceTestResult> {
  const status = await getFinanceSuperAdminStatus();
  if (!status.envEnabled) {
    return {
      success: false,
      error: "Test data marking is not enabled in this environment.",
    };
  }
  if (!status.isSuperAdmin) {
    return { success: false, error: "Not authorized." };
  }

  const parsed = parseTransactionId(input.transactionId);
  if (!parsed) {
    return { success: false, error: "Unrecognised finance row id." };
  }

  const user = await getAuthUser();
  const performer = user
    ? { userId: user.id, email: user.email, name: user.fullName }
    : null;

  // ── Subscription ────────────────────────────────────────────────
  if (parsed.source === "subscription") {
    const subRepo = getSubscriptionRepo();
    const sub = await subRepo.getById(parsed.recordId);
    if (!sub) return { success: false, error: "Subscription not found." };

    const currentlyMarked = hasTestMarker(
      sub.paymentNotes,
      sub.notes,
      sub.paymentReference,
      sub.refundReason
    );

    if (input.mark && currentlyMarked) {
      return {
        success: true,
        alreadyInState: true,
        isMarked: true,
        source: "subscription",
        recordId: sub.id,
      };
    }
    if (!input.mark && !currentlyMarked) {
      return {
        success: true,
        alreadyInState: true,
        isMarked: false,
        source: "subscription",
        recordId: sub.id,
      };
    }

    let nextPaymentNotes: string | null;
    let nextNotes: string | null = sub.notes ?? null;
    let nextRef: string | null = sub.paymentReference ?? null;
    let nextRefundReason: string | null = sub.refundReason ?? null;

    if (input.mark) {
      // Add marker into paymentNotes — never touch reference / refundReason.
      nextPaymentNotes = withMarker(sub.paymentNotes);
    } else {
      // Strip marker from every field where it might live so the row stops
      // appearing in the candidate list.
      nextPaymentNotes = withoutMarker(sub.paymentNotes);
      nextNotes = withoutMarker(sub.notes);
      nextRef = withoutMarker(sub.paymentReference);
      nextRefundReason = withoutMarker(sub.refundReason);
    }

    try {
      await subRepo.update(sub.id, {
        paymentNotes: nextPaymentNotes,
        notes: nextNotes,
        paymentReference: nextRef,
        refundReason: nextRefundReason,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Subscription update failed.",
      };
    }

    logFinanceEvent({
      entityType: "subscription",
      entityId: sub.id,
      action: "manual_edit",
      performer,
      detail: input.mark
        ? "Super-admin marked record as test data"
        : "Super-admin removed test marker",
      previousValue: currentlyMarked ? "test" : "not_test",
      newValue: input.mark ? "test" : "not_test",
    });

    invalidateHydration();
    revalidatePath("/finance");
    revalidatePath("/students");

    return {
      success: true,
      isMarked: input.mark,
      source: "subscription",
      recordId: sub.id,
    };
  }

  // ── Penalty ─────────────────────────────────────────────────────
  if (parsed.source === "penalty") {
    const svc = getPenaltyService();
    const penalty = svc
      .getAllPenalties()
      .find((p) => p.id === parsed.recordId);
    if (!penalty) return { success: false, error: "Penalty not found." };

    const currentlyMarked = hasTestMarker(penalty.notes);

    if (input.mark && currentlyMarked) {
      return {
        success: true,
        alreadyInState: true,
        isMarked: true,
        source: "penalty",
        recordId: penalty.id,
      };
    }
    if (!input.mark && !currentlyMarked) {
      return {
        success: true,
        alreadyInState: true,
        isMarked: false,
        source: "penalty",
        recordId: penalty.id,
      };
    }

    const nextNotes = input.mark
      ? withMarker(penalty.notes)
      : withoutMarker(penalty.notes);

    const updated = svc.updateNotes(penalty.id, nextNotes);
    if (!updated) {
      return { success: false, error: "Penalty update failed." };
    }
    if (isRealUser(penalty.studentId)) {
      try {
        await updatePenaltyInDB(penalty.id, { notes: nextNotes });
      } catch {
        /* persistence is best-effort; in-memory update already succeeded */
      }
    }

    logFinanceEvent({
      entityType: "penalty",
      entityId: penalty.id,
      action: "manual_edit",
      performer,
      detail: input.mark
        ? "Super-admin marked record as test data"
        : "Super-admin removed test marker",
      previousValue: currentlyMarked ? "test" : "not_test",
      newValue: input.mark ? "test" : "not_test",
    });

    invalidateHydration();
    revalidatePath("/finance");
    revalidatePath("/penalties");

    return {
      success: true,
      isMarked: input.mark,
      source: "penalty",
      recordId: penalty.id,
    };
  }

  // ── Event purchase ─────────────────────────────────────────────
  if (parsed.source === "event_purchase") {
    let eventRepo: ReturnType<typeof getSpecialEventRepo>;
    try {
      eventRepo = getSpecialEventRepo();
    } catch {
      return { success: false, error: "Event module is not active in this environment." };
    }
    const purchase = await eventRepo.getPurchaseById(parsed.recordId);
    if (!purchase) return { success: false, error: "Event purchase not found." };

    const currentlyMarked = hasTestMarker(
      purchase.notes,
      purchase.paymentReference,
      purchase.refundReason
    );

    if (input.mark && currentlyMarked) {
      return {
        success: true,
        alreadyInState: true,
        isMarked: true,
        source: "event_purchase",
        recordId: purchase.id,
      };
    }
    if (!input.mark && !currentlyMarked) {
      return {
        success: true,
        alreadyInState: true,
        isMarked: false,
        source: "event_purchase",
        recordId: purchase.id,
      };
    }

    let nextNotes: string | null = purchase.notes ?? null;
    let nextRef: string | null | undefined; // undefined = leave untouched
    let nextRefundReason: string | null | undefined;

    if (input.mark) {
      // Add the canonical marker to `notes` only — never touch a real
      // payment_reference (could hold Stripe / bank / Revolut ids).
      nextNotes = withMarker(purchase.notes);
    } else {
      // Strip the marker from every field where it may live so the row
      // stops appearing in the candidate list.
      nextNotes = withoutMarker(purchase.notes);
      nextRef = withoutMarker(purchase.paymentReference);
      nextRefundReason = withoutMarker(purchase.refundReason);
    }

    try {
      await eventRepo.updatePurchaseTestFields(purchase.id, {
        notes: nextNotes,
        ...(nextRef !== undefined ? { paymentReference: nextRef } : {}),
        ...(nextRefundReason !== undefined ? { refundReason: nextRefundReason } : {}),
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Event purchase update failed.",
      };
    }

    logFinanceEvent({
      entityType: "event_purchase",
      entityId: purchase.id,
      action: "manual_edit",
      performer,
      detail: input.mark
        ? "Super-admin marked record as test data"
        : "Super-admin removed test marker",
      previousValue: currentlyMarked ? "test" : "not_test",
      newValue: input.mark ? "test" : "not_test",
    });

    invalidateHydration();
    revalidatePath("/finance");
    revalidatePath("/events");

    return {
      success: true,
      isMarked: input.mark,
      source: "event_purchase",
      recordId: purchase.id,
    };
  }

  return { success: false, error: "Unsupported source." };
}
