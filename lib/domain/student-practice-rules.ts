/**
 * Student Practice payment rules for BPM.
 *
 * A student attending Student Practice must pay €5 UNLESS they have already
 * attended a regular class on the same day. This module provides the pure
 * check — the UI uses it to show a payment confirmation warning and the
 * server can reuse it if automated enforcement is added later.
 */

export const STUDENT_PRACTICE_FEE_CENTS = 500;
export const STUDENT_PRACTICE_FEE_LABEL = "€5";

export interface StudentPracticeCheck {
  requiresPayment: boolean;
  reason: string;
}

/**
 * Determine whether a student must pay for Student Practice on a given date.
 *
 * @param studentId  The student being checked
 * @param date       The date of the Student Practice session (YYYY-MM-DD)
 * @param attendedClassIds  Set of bookableClassIds where this student has
 *                          present/late attendance on this date
 * @param classTypeByInstanceId  Map from bookableClassId → classType string
 */
export function checkStudentPracticePayment(
  studentId: string,
  date: string,
  attendedClassIds: string[],
  classTypeByInstanceId: Map<string, string>
): StudentPracticeCheck {
  const attendedRealClass = attendedClassIds.some(
    (id) => classTypeByInstanceId.get(id) === "class"
  );

  if (attendedRealClass) {
    return {
      requiresPayment: false,
      reason: "Student attended a class today — no charge for Student Practice.",
    };
  }

  return {
    requiresPayment: true,
    reason: `This student has not attended any class today. They must pay ${STUDENT_PRACTICE_FEE_LABEL} for Student Practice. Confirm only once payment has been collected.`,
  };
}
