import type { MockStudent } from "@/lib/mock-data";
import type { DanceRole } from "@/types/domain";

export interface CreateStudentData {
  fullName: string;
  email: string;
  phone: string | null;
  preferredRole: DanceRole | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
}

export type StudentPatch = Partial<
  Pick<
    MockStudent,
    | "fullName"
    | "email"
    | "phone"
    | "preferredRole"
    | "notes"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "dateOfBirth"
  >
>;

export interface IStudentRepository {
  getAll(): Promise<MockStudent[]>;
  getById(id: string): Promise<MockStudent | null>;
  create(data: CreateStudentData): Promise<MockStudent>;
  update(id: string, patch: StudentPatch): Promise<MockStudent | null>;
  toggleActive(id: string): Promise<MockStudent | null>;
}
