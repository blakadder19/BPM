/**
 * In-memory store for class cancellation notices.
 * When admin cancels/deletes a class, affected students get a notice
 * that is surfaced in the student bell notification.
 *
 * Persists across HMR via globalThis. Entries auto-expire after 7 days.
 */

export interface ClassCancellationNotice {
  id: string;
  studentId: string;
  studentName: string;
  classTitle: string;
  classDate: string;
  startTime: string;
  creditReverted: boolean;
  createdAt: string;
}

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const KEY = "__bpm_class_cancellation_notices";

function getStore(): ClassCancellationNotice[] {
  if (!(globalThis as Record<string, unknown>)[KEY]) {
    (globalThis as Record<string, unknown>)[KEY] = [];
  }
  return (globalThis as Record<string, unknown>)[KEY] as ClassCancellationNotice[];
}

function pruneExpired(): void {
  const store = getStore();
  const cutoff = Date.now() - EXPIRY_MS;
  const pruned = store.filter((n) => new Date(n.createdAt).getTime() > cutoff);
  (globalThis as Record<string, unknown>)[KEY] = pruned;
}

let counter = 0;

export function addClassCancellationNotices(
  notices: Omit<ClassCancellationNotice, "id" | "createdAt">[]
): ClassCancellationNotice[] {
  pruneExpired();
  const store = getStore();
  const now = new Date().toISOString();
  const result: ClassCancellationNotice[] = [];
  for (const n of notices) {
    counter += 1;
    const full: ClassCancellationNotice = { ...n, id: `ccn-${Date.now()}-${counter}`, createdAt: now };
    store.push(full);
    result.push(full);
  }
  return result;
}

export function getNoticesForStudent(studentId: string): ClassCancellationNotice[] {
  pruneExpired();
  return getStore().filter((n) => n.studentId === studentId);
}

export function dismissStudentNotice(noticeId: string): void {
  const store = getStore();
  const idx = store.findIndex((n) => n.id === noticeId);
  if (idx !== -1) store.splice(idx, 1);
}
