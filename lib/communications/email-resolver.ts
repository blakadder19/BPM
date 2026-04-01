import "server-only";

/**
 * Resolves a studentId to an email address.
 *
 * For real (UUID) users: queries the student repository.
 * For mock users (dev mode): falls back to mock data lookup.
 *
 * Returns null if the email cannot be resolved — callers should
 * skip email sending gracefully.
 */

import { isRealUser } from "@/lib/utils/is-real-user";
import { getStudentRepo } from "@/lib/repositories";

export async function resolveStudentEmail(
  studentId: string
): Promise<string | null> {
  try {
    const student = await getStudentRepo().getById(studentId);
    if (student?.email) return student.email;

    if (!isRealUser(studentId)) {
      return null;
    }

    return null;
  } catch (e) {
    console.warn(
      "[email-resolver] Failed to resolve email for",
      studentId,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
