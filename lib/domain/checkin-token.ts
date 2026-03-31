/**
 * Check-in token generation and validation.
 *
 * Booking tokens: 32-character hex strings used as per-booking QR payloads.
 * Student QR tokens: "bpm-" prefixed 32-char hex — persistent student identity
 * for attendance scanning. Generated once per student and reused across bookings.
 */

export function generateCheckInToken(): string {
  const segments = [
    Date.now().toString(16),
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 10),
  ];
  return segments.join("").slice(0, 32).padEnd(32, "0");
}

export function isValidTokenFormat(token: string): boolean {
  return typeof token === "string" && /^[a-f0-9]{32}$/.test(token);
}

export function generateStudentQrToken(): string {
  const hex = [
    Date.now().toString(16),
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 10),
  ].join("").slice(0, 32).padEnd(32, "0");
  return `bpm-${hex}`;
}

export function isValidStudentQrToken(token: string): boolean {
  return typeof token === "string" && /^bpm-[a-f0-9]{32}$/.test(token);
}
