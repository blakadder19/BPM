import { DANCE_STYLES, type MockDanceStyle } from "@/lib/mock-data";
import type {
  CreateDanceStyleInput,
  IDanceStyleRepository,
} from "../interfaces/dance-style-repository";

/**
 * Memory-mode implementation. `DANCE_STYLES` is a mutable module-scoped
 * array — pushing a new style here makes it visible to every consumer
 * that calls `getDanceStyles()` later in the same process.
 */
export const memoryDanceStyleRepo: IDanceStyleRepository = {
  async getAll(): Promise<MockDanceStyle[]> {
    return [...DANCE_STYLES];
  },

  async getById(id: string): Promise<MockDanceStyle | null> {
    return DANCE_STYLES.find((s) => s.id === id) ?? null;
  },

  async findByName(name: string): Promise<MockDanceStyle | null> {
    const needle = name.trim().toLowerCase();
    return (
      DANCE_STYLES.find((s) => s.name.trim().toLowerCase() === needle) ?? null
    );
  },

  async create(input: CreateDanceStyleInput): Promise<MockDanceStyle> {
    const created: MockDanceStyle = {
      id: `ds-mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name.trim(),
      description: null,
      requiresRoleBalance: input.requiresRoleBalance ?? false,
    };
    DANCE_STYLES.push(created);
    return created;
  },
};
