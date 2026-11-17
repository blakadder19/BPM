/**
 * Staff receipt actions: Send / Resend receipt and the receipt business
 * details form. Permission checks, audit content (no raw tokens) and
 * input validation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  allowed: new Set<string>(),
  send: vi.fn(),
  audit: vi.fn(),
  saveReceiptBusiness: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/staff-permissions", () => ({
  requirePermissionForAction: async (key: string) =>
    h.allowed.has(key)
      ? { ok: true, access: { user: { id: "staff-1", email: "staff@example.test", fullName: "Staff" } } }
      : { ok: false, error: "You do not have permission to perform this action." },
}));
vi.mock("@/lib/services/guest-receipt-delivery", () => ({ sendStaffGuestReceipt: h.send }));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: h.audit }));
vi.mock("@/lib/services/settings-store", () => ({ updateReceiptBusinessSettings: h.saveReceiptBusiness }));

import { sendGuestReceiptAction } from "../receipts";
import { saveReceiptBusinessSettingsAction } from "../receipt-settings";

const PURCHASE = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  h.allowed.clear();
  h.send.mockReset();
  h.audit.mockReset();
  h.saveReceiptBusiness.mockReset().mockResolvedValue({ ok: true });
});

describe("sendGuestReceiptAction", () => {
  it("requires payments:send_receipt and sends nothing without it", async () => {
    h.allowed.add("payments:refund");
    h.allowed.add("events:edit");
    const res = await sendGuestReceiptAction({ purchaseId: PURCHASE });
    expect(res).toEqual({ success: false, error: "You do not have permission to perform this action." });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("only takes the purchase id; the recipient comes from the purchase", async () => {
    h.allowed.add("payments:send_receipt");
    h.send.mockResolvedValue({ ok: true, eventId: "evt-1", recipientEmail: "zaria.test@example.com", tokenId: "tok-2", replacedPreviousLink: true });
    const res = await sendGuestReceiptAction({ purchaseId: PURCHASE, to: "attacker@example.com" } as { purchaseId: string });
    expect(h.send).toHaveBeenCalledWith({ eventPurchaseId: PURCHASE, staffUserId: "staff-1" });
    expect(res).toEqual({
      success: true,
      message: "Receipt sent to zaria.test@example.com. The previous receipt link no longer works.",
    });
  });

  it("audits the send with the token id only", async () => {
    h.allowed.add("payments:send_receipt");
    h.send.mockResolvedValue({ ok: true, eventId: "evt-1", recipientEmail: "zaria.test@example.com", tokenId: "tok-2", replacedPreviousLink: false });
    await sendGuestReceiptAction({ purchaseId: PURCHASE });
    expect(h.audit).toHaveBeenCalledTimes(1);
    const entry = h.audit.mock.calls[0][0];
    expect(entry).toMatchObject({
      entityType: "event_purchase",
      entityId: PURCHASE,
      action: "receipt_sent",
      performer: { userId: "staff-1" },
      metadata: { receiptTokenId: "tok-2", replacedPreviousLink: false },
    });
    expect(JSON.stringify(entry)).not.toContain("/receipt/");
  });

  it("surfaces the delivery error and does not audit a send that did not happen", async () => {
    h.allowed.add("payments:send_receipt");
    h.send.mockResolvedValue({
      ok: false,
      code: "send_failed",
      previousLinkActive: true,
      error: "The email could not be sent. The customer's previous receipt link still works.",
    });
    const res = await sendGuestReceiptAction({ purchaseId: PURCHASE });
    expect(res).toEqual({ success: false, error: "The email could not be sent. The customer's previous receipt link still works." });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("rejects a missing purchase id", async () => {
    h.allowed.add("payments:send_receipt");
    expect((await sendGuestReceiptAction({ purchaseId: "" })).success).toBe(false);
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("saveReceiptBusinessSettingsAction", () => {
  it("requires settings:edit", async () => {
    h.allowed.add("payments:send_receipt");
    const res = await saveReceiptBusinessSettingsAction({ tradingName: "X" });
    expect(res.success).toBe(false);
    expect(h.saveReceiptBusiness).not.toHaveBeenCalled();
  });

  it("saves trimmed values and stores blanks as not configured", async () => {
    h.allowed.add("settings:edit");
    const res = await saveReceiptBusinessSettingsAction({
      tradingName: "  Balance Power Motion ",
      contactEmail: "hello@example.test",
      website: "https://www.example.test",
      vatNumber: "   ",
    });
    expect(res.success).toBe(true);
    const saved = h.saveReceiptBusiness.mock.calls[0][0];
    expect(saved.tradingName).toBe("Balance Power Motion");
    expect(saved.vatNumber).toBeNull();
    expect(saved.legalName).toBeNull();
  });

  it.each([
    [{ contactEmail: "not-an-email" }, "Contact email"],
    [{ website: "javascript:alert(1)" }, "Website"],
    [{ tradingName: "x".repeat(201) }, ""],
    [{ footerNote: "x".repeat(501) }, ""],
  ])("rejects invalid input %#", async (input, message) => {
    h.allowed.add("settings:edit");
    const res = await saveReceiptBusinessSettingsAction(input);
    expect(res.success).toBe(false);
    if (!res.success && message) expect(res.error).toContain(message);
    expect(h.saveReceiptBusiness).not.toHaveBeenCalled();
  });

  it("reports a storage failure", async () => {
    h.allowed.add("settings:edit");
    h.saveReceiptBusiness.mockResolvedValue({ ok: false, error: "Could not load the current settings. Nothing was saved." });
    expect(await saveReceiptBusinessSettingsAction({ tradingName: "X" })).toEqual({
      success: false,
      error: "Could not load the current settings. Nothing was saved.",
    });
  });
});
