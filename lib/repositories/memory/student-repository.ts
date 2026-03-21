import * as store from "@/lib/services/student-store";
import type { IStudentRepository, CreateStudentData, StudentPatch } from "../interfaces/student-repository";

export const memoryStudentRepo: IStudentRepository = {
  getAll: async () => store.getStudents(),
  getById: async (id) => store.getStudent(id) ?? null,
  create: async (data: CreateStudentData) => store.createStudent(data),
  update: async (id, patch: StudentPatch) => store.updateStudent(id, patch),
  toggleActive: async (id) => store.toggleStudentActive(id),
  delete: async (id) => store.deleteStudent(id),
};
