/**
 * Deterministic ids for audit entries that may need to be re-written.
 *
 * An audit write can fail after the booking, attendance and credit
 * have already been committed. Recovering from that must re-attempt
 * ONLY the audit row — never the consumption — so the recovery has to
 * land on the same primary key every time. A random id would produce
 * a duplicate entry per retry and make the log itself untrustworthy.
 *
 * Why the id is built by concatenation rather than hashed:
 * persistence upserts on this id, so two different corrections that
 * collided would SILENTLY OVERWRITE each other's audit entry. A
 * truncated hash makes that a birthday problem — 32 bits is roughly
 * even odds of a collision somewhere around 77k corrections — and
 * losing an audit record is precisely the failure this module exists
 * to prevent. Length-prefixing each component makes the encoding
 * injective, so distinct inputs cannot produce the same id at all.
 * `op_finance_audit_log.id` is `text`, so the extra length is free,
 * and the result stays greppable back to its booking.
 */

/**
 * Length-prefixed join. `3:a|b:c` and `1:a:b|c` differ even though a
 * naive `a|b::c` join would not, so no choice of separator inside the
 * inputs can forge a different pair's id.
 */
function injectiveJoin(parts: string[]): string {
  return parts.map((p) => `${p.length}:${p}`).join("");
}

/**
 * Audit id for a backdated attendance correction.
 *
 * The booking and attendance ids alone are NOT unique per correction:
 * the same pair is corrected again if the student is later marked
 * absent and then re-corrected, and with an upsert the second
 * correction would erase the first one's entry. The attendance
 * row's `markedAt`, rewritten by every mark, separates corrections
 * while staying stable for a retry of the same correction.
 *
 * @param bookingId    Booking the correction settled on, reinstated or created.
 * @param attendanceId Attendance row written by the correction.
 * @param markedAt     That row's `markedAt` as written by the correction.
 */
export function backdateAuditEntryId(
  bookingId: string,
  attendanceId: string,
  markedAt: string,
): string {
  return `fal-bd-${injectiveJoin([bookingId, attendanceId, markedAt])}`;
}
