import type { MockDanceStyle } from "@/lib/mock-data";

export interface IDanceStyleRepository {
  getAll(): Promise<MockDanceStyle[]>;
  getById(id: string): Promise<MockDanceStyle | null>;
}
