import { getAttendanceService } from "@/lib/services/attendance-store";
import type { IAttendanceRepository } from "../interfaces/attendance-repository";

export const memoryAttendanceRepo: IAttendanceRepository = {
  getService: () => getAttendanceService(),
};
