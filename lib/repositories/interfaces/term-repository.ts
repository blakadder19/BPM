import type { MockTerm } from "@/lib/mock-data";
import type { TermStatus } from "@/types/domain";

export interface CreateTermData {
  name: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
  notes: string | null;
}

export type TermPatch = Partial<
  Pick<MockTerm, "name" | "startDate" | "endDate" | "status" | "notes">
>;

export interface ITermRepository {
  getAll(): Promise<MockTerm[]>;
  getById(id: string): Promise<MockTerm | null>;
  create(data: CreateTermData): Promise<MockTerm>;
  update(id: string, patch: TermPatch): Promise<MockTerm | null>;
}
