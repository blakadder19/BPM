import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockDanceStyle } from "@/lib/mock-data";
import type {
  CreateDanceStyleInput,
  IDanceStyleRepository,
} from "@/lib/repositories/interfaces/dance-style-repository";

// Stub revalidatePath so the action can run outside a Next request.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Toggle these between tests to simulate "no permission" / "has permission".
let GUARD_OK = true;

vi.mock("@/lib/staff-permissions", () => ({
  requireAnyPermissionForAction: async () =>
    GUARD_OK
      ? { ok: true, access: {} }
      : { ok: false, error: "You do not have permission to perform this action." },
}));

// Single mutable repo instance shared by every test.
const styles: MockDanceStyle[] = [];

const repo: IDanceStyleRepository = {
  async getAll() {
    return [...styles];
  },
  async getById(id) {
    return styles.find((s) => s.id === id) ?? null;
  },
  async findByName(name) {
    const needle = name.trim().toLowerCase();
    return (
      styles.find((s) => s.name.trim().toLowerCase() === needle) ?? null
    );
  },
  async create(input: CreateDanceStyleInput) {
    const created: MockDanceStyle = {
      id: `ds-${styles.length + 1}`,
      name: input.name.trim(),
      description: null,
      requiresRoleBalance: input.requiresRoleBalance ?? false,
    };
    styles.push(created);
    return created;
  },
};

vi.mock("@/lib/repositories", () => ({
  getDanceStyleRepo: () => repo,
}));

const importAction = async () =>
  import("@/lib/actions/dance-styles").then((m) => m.createDanceStyleAction);

beforeEach(() => {
  styles.length = 0;
  GUARD_OK = true;
  delete (globalThis as { __bpm_danceStyles?: MockDanceStyle[] }).__bpm_danceStyles;
});

describe("createDanceStyleAction", () => {
  it("creates a brand-new style", async () => {
    const createDanceStyleAction = await importAction();
    const res = await createDanceStyleAction({ name: "Kizomba" });
    expect(res.success).toBe(true);
    expect(res.style?.name).toBe("Kizomba");
    expect(res.reused).toBe(false);
    expect(styles).toHaveLength(1);
  });

  it("trims whitespace from the name", async () => {
    const createDanceStyleAction = await importAction();
    const res = await createDanceStyleAction({ name: "  Heels  " });
    expect(res.success).toBe(true);
    expect(res.style?.name).toBe("Heels");
  });

  it("rejects blank names", async () => {
    const createDanceStyleAction = await importAction();
    const res = await createDanceStyleAction({ name: "   " });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/required/i);
    expect(styles).toHaveLength(0);
  });

  it("dedupes case-insensitively and returns the existing style", async () => {
    const createDanceStyleAction = await importAction();
    await createDanceStyleAction({ name: "Bachata" });
    const second = await createDanceStyleAction({ name: "  bachata " });
    expect(second.success).toBe(true);
    expect(second.reused).toBe(true);
    expect(second.style?.name).toBe("Bachata");
    expect(styles).toHaveLength(1);

    const third = await createDanceStyleAction({ name: "BACHATA" });
    expect(third.reused).toBe(true);
    expect(styles).toHaveLength(1);
  });

  it("respects the role-balance flag", async () => {
    const createDanceStyleAction = await importAction();
    const res = await createDanceStyleAction({
      name: "Salsa On2",
      requiresRoleBalance: true,
    });
    expect(res.style?.requiresRoleBalance).toBe(true);

    const noRb = await createDanceStyleAction({
      name: "Pilates",
      requiresRoleBalance: false,
    });
    expect(noRb.style?.requiresRoleBalance).toBe(false);
  });

  it("rejects unauthorised callers", async () => {
    GUARD_OK = false;
    const createDanceStyleAction = await importAction();
    const res = await createDanceStyleAction({ name: "Contemporary" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permission/i);
    expect(styles).toHaveLength(0);
  });

  it("appends to globalThis.__bpm_danceStyles so reads pick it up", async () => {
    const createDanceStyleAction = await importAction();
    await createDanceStyleAction({ name: "Afro" });
    const cached = (globalThis as { __bpm_danceStyles?: MockDanceStyle[] })
      .__bpm_danceStyles;
    expect(cached).toBeDefined();
    expect(cached?.[0]?.name).toBe("Afro");
  });
});
