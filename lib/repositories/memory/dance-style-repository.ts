import { DANCE_STYLES, type MockDanceStyle } from "@/lib/mock-data";
import type { IDanceStyleRepository } from "../interfaces/dance-style-repository";

export const memoryDanceStyleRepo: IDanceStyleRepository = {
  async getAll(): Promise<MockDanceStyle[]> {
    return [...DANCE_STYLES];
  },

  async getById(id: string): Promise<MockDanceStyle | null> {
    return DANCE_STYLES.find((s) => s.id === id) ?? null;
  },
};
