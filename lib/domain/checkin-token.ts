/**
 * Check-in token generation and validation.
 *
 * Tokens are 32-character hex strings used as QR payloads.
 * Each confirmed booking gets a unique token at creation time.
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
