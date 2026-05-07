import type { MockDanceStyle } from "@/lib/mock-data";

/**
 * Input accepted by `createDanceStyle`. The repo is the single point
 * that knows how to map this into either a Supabase INSERT or a
 * memory-mode push.
 *
 * Permission gating, validation, normalisation (trim/casing) and
 * cross-cutting concerns like cache revalidation live in the calling
 * server action — the repo is "dumb storage".
 */
export interface CreateDanceStyleInput {
  name: string;
  requiresRoleBalance?: boolean;
  sortOrder?: number;
}

export interface IDanceStyleRepository {
  getAll(): Promise<MockDanceStyle[]>;
  getById(id: string): Promise<MockDanceStyle | null>;
  /**
   * Case-insensitive lookup. Used by the create flow to dedupe and
   * return the existing record instead of creating a near-duplicate.
   */
  findByName(name: string): Promise<MockDanceStyle | null>;
  create(input: CreateDanceStyleInput): Promise<MockDanceStyle>;
}
