import type { IAttendanceRepository } from "../interfaces/attendance-repository";

export const supabaseAttendanceRepo: IAttendanceRepository = {
  getService() {
    throw new Error(
      "Supabase AttendanceRepository not yet implemented. " +
      "Set DATA_PROVIDER=memory to use the in-memory attendance service."
    );
  },
};
