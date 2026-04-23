import {
  isValidStudentQrToken,
  isValidGuestPurchaseQrToken,
} from "@/lib/domain/checkin-token";

export type QrTokenType = "student" | "event_guest" | "unknown";

export function classifyQrToken(token: string): QrTokenType {
  if (isValidStudentQrToken(token)) return "student";
  if (isValidGuestPurchaseQrToken(token)) return "event_guest";
  return "unknown";
}

export type QrResolvedResult =
  | { type: "student"; studentId: string; studentName: string; studentEmail: string }
  | { type: "event_guest"; guestName: string; eventTitle: string; eventId: string; purchaseId: string; paymentStatus: string }
  | { type: "unknown"; rawToken: string }
  | { type: "error"; message: string };
