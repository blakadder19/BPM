/**
 * In-memory tracker for birthday free class redemptions.
 * Tracks which students have already used their birthday-week free class.
 * In production, replace with a database-backed service.
 */

interface BirthdayRedemption {
  studentId: string;
  year: number;
  redeemedAt: string;
}

const g = globalThis as unknown as {
  __bpm_birthday_redemptions?: BirthdayRedemption[];
};

function init(): BirthdayRedemption[] {
  if (!g.__bpm_birthday_redemptions) {
    g.__bpm_birthday_redemptions = [];
  }
  return g.__bpm_birthday_redemptions;
}

export function isBirthdayClassUsed(
  studentId: string,
  year: number
): boolean {
  return init().some((r) => r.studentId === studentId && r.year === year);
}

export function markBirthdayClassUsed(
  studentId: string,
  year: number
): void {
  const list = init();
  if (list.some((r) => r.studentId === studentId && r.year === year)) return;
  list.push({
    studentId,
    year,
    redeemedAt: new Date().toISOString(),
  });
}

export function getBirthdayRedemptions(): BirthdayRedemption[] {
  return [...init()];
}
