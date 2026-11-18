import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  guard: { ok: true } as { ok: true } | { ok: false; error: string },
  hydrate: vi.fn(async () => {}),
  update: vi.fn(async (patch: Record<string, unknown>) => ({ ...patch })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/staff-permissions", () => ({
  requirePermissionForAction: vi.fn(async () => h.guard),
}));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@/lib/services/settings-store", () => ({
  getSettings: () => ({ allowBeginnerNextTermAdvanceBooking: true }),
  hydrateSettings: h.hydrate,
  updateSettings: h.update,
}));

import { saveSettings } from "@/lib/actions/settings";
import { requirePermissionForAction } from "@/lib/staff-permissions";

function validForm(): FormData {
  const fd = new FormData();
  fd.set("lateCancelFeeCents", "200");
  fd.set("noShowFeeCents", "500");
  fd.set("lateCancelCutoffMinutes", "60");
  fd.set("allowedRoleImbalance", "1");
  fd.set("waitlistOfferExpiryHours", "24");
  fd.set("termPurchaseWindowDays", "14");
  for (const t of ["pass", "drop_in", "membership"]) fd.append("creditDeductionPriority", t);
  return fd;
}

beforeEach(() => {
  h.guard = { ok: true };
  h.hydrate.mockReset().mockResolvedValue(undefined);
  h.update.mockReset().mockImplementation(async (patch) => ({ ...patch }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveSettings", () => {
  it("still requires settings:edit before touching settings", async () => {
    h.guard = { ok: false, error: "Not allowed" };
    const res = await saveSettings(validForm());
    expect(res).toMatchObject({ success: false, error: "Not allowed" });
    expect(requirePermissionForAction).toHaveBeenCalledWith("settings:edit");
    expect(h.hydrate).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("saves nothing when settings cannot be loaded", async () => {
    h.hydrate.mockRejectedValue(new Error("schema cache"));
    const res = await saveSettings(validForm());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/temporarily unavailable/i);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("reports a failed database write instead of success", async () => {
    h.update.mockRejectedValue(new Error("write failed"));
    const res = await saveSettings(validForm());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/could not be saved/i);
  });

  it("loads settings before saving a valid form", async () => {
    const res = await saveSettings(validForm());
    expect(res.success).toBe(true);
    expect(h.hydrate.mock.invocationCallOrder[0]).toBeLessThan(h.update.mock.invocationCallOrder[0]);
  });
});
