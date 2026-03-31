/**
 * Seed data aligned with the REAL BPM Academy catalog and timetable.
 * Source: BPM academy documents (Booking system information.docx, BPM_Master_Handoff_Fresh_Chat.docx).
 * Replace with Supabase queries when fully connected.
 */

import type {
  AttendanceMark,
  BookingStatus,
  CheckInMethod,
  ClassType,
  CreditsModel,
  DanceRole,
  InstanceStatus,
  PaymentMethod,
  PenaltyReason,
  PenaltyResolution,
  ProductType,
  SalePaymentStatus,
  SubscriptionStatus,
  TermStatus,
  TxType,
  WaitlistStatus,
} from "@/types/domain";

// ── Dance Styles ────────────────────────────────────────────

export interface MockDanceStyle {
  id: string;
  name: string;
  description: string | null;
  requiresRoleBalance: boolean;
}

export const DANCE_STYLES: MockDanceStyle[] = [
  { id: "ds-1", name: "Bachata", description: "A sensual partner dance from the Dominican Republic, blending smooth footwork with expressive body movement.", requiresRoleBalance: true },
  { id: "ds-2", name: "Bachata Tradicional", description: "The original Dominican style of Bachata, focused on footwork, rhythm, and close partner connection.", requiresRoleBalance: true },
  { id: "ds-4", name: "Cuban", description: "Cuban-style Salsa (Casino) featuring circular partner movement, Afro-Cuban body motion, and playful energy.", requiresRoleBalance: true },
  { id: "ds-5", name: "Salsa Line", description: "Linear Salsa (LA/NY style) with structured turn patterns, shines, and dynamic partner work on a line.", requiresRoleBalance: true },
  { id: "ds-6", name: "Reggaeton", description: "Urban Latin dance focusing on isolations, rhythm interpretation, and high-energy solo movement.", requiresRoleBalance: false },
  { id: "ds-7", name: "Ladies Styling", description: "Technique and styling for followers — arm work, body movement, and personal expression in Latin dance.", requiresRoleBalance: false },
  { id: "ds-8", name: "Afro-Cuban", description: "Afro-Cuban folkloric and popular dance rooted in West African and Cuban traditions.", requiresRoleBalance: false },
  { id: "ds-9", name: "Yoga", description: "Yoga classes for dancers — flexibility, strength, balance, and recovery.", requiresRoleBalance: false },
  { id: "ds-10", name: "Kids Hip Hop", description: "Fun, high-energy hip-hop dance classes for children.", requiresRoleBalance: false },
];

const styleMap = Object.fromEntries(DANCE_STYLES.map((s) => [s.id, s.name]));

export function styleRequiresRoleBalance(styleName: string | null): boolean {
  if (!styleName) return false;
  return DANCE_STYLES.find((s) => s.name === styleName)?.requiresRoleBalance ?? false;
}

// ── Terms (Real BPM 2026 terms — 4-week blocks) ────────────

export interface MockTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
  notes: string | null;
}

export const TERMS: MockTerm[] = [
  { id: "term-1", name: "Term 1", startDate: "2026-03-30", endDate: "2026-04-26", status: "upcoming", notes: null },
  { id: "term-2", name: "Term 2", startDate: "2026-04-27", endDate: "2026-05-24", status: "upcoming", notes: null },
  { id: "term-3", name: "Term 3", startDate: "2026-05-25", endDate: "2026-06-21", status: "upcoming", notes: null },
  { id: "term-4", name: "Term 4", startDate: "2026-06-22", endDate: "2026-07-19", status: "upcoming", notes: null },
  { id: "term-5", name: "Term 5", startDate: "2026-07-20", endDate: "2026-08-16", status: "upcoming", notes: null },
  { id: "term-6", name: "Term 6", startDate: "2026-08-17", endDate: "2026-09-13", status: "upcoming", notes: null },
  { id: "term-7", name: "Term 7", startDate: "2026-09-14", endDate: "2026-10-11", status: "upcoming", notes: null },
  { id: "term-8", name: "Term 8", startDate: "2026-10-12", endDate: "2026-11-08", status: "upcoming", notes: null },
  { id: "term-9", name: "Term 9", startDate: "2026-11-09", endDate: "2026-12-06", status: "upcoming", notes: null },
];

// ── Class Templates (Real BPM April timetable) ──────────────
// Term-bound rule: ONLY Beginner 1 and Beginner 2 classes are term-bound.

export interface MockClass {
  id: string;
  title: string;
  classType: "class" | "social" | "student_practice";
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
  isActive: boolean;
  notes?: string | null;
  termBound?: boolean;
  termId?: string | null;
  status?: "active" | "inactive" | "archived";
}

export const CLASSES: MockClass[] = [
  // ── MONDAY (dayOfWeek=1) ──
  { id: "c-01", title: "Yoga Flow", classType: "class", styleId: "ds-9", styleName: "Yoga", level: "All Levels", dayOfWeek: 1, startTime: "10:00", endTime: "11:00", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-02", title: "Yoga Flow", classType: "class", styleId: "ds-9", styleName: "Yoga", level: "All Levels", dayOfWeek: 1, startTime: "11:00", endTime: "12:00", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-03", title: "Cuban Improvers", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Improvers", dayOfWeek: 1, startTime: "18:30", endTime: "19:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-04", title: "Cuban Intermediate", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Intermediate", dayOfWeek: 1, startTime: "18:30", endTime: "19:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-05", title: "Salsa Line Improvers", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Improvers", dayOfWeek: 1, startTime: "19:30", endTime: "20:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-06", title: "Salsa Line Intermediate", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Intermediate", dayOfWeek: 1, startTime: "19:30", endTime: "20:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-07", title: "Bachata Improvers", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Improvers", dayOfWeek: 1, startTime: "20:30", endTime: "21:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-08", title: "Bachata Intermediate", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Intermediate", dayOfWeek: 1, startTime: "20:30", endTime: "21:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-09", title: "Monday Social", classType: "social", styleId: null, styleName: null, level: null, dayOfWeek: 1, startTime: "21:30", endTime: "00:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "BPM Studio", isActive: true },

  // ── TUESDAY (dayOfWeek=2) ──
  { id: "c-10", title: "Yoga Flow", classType: "class", styleId: "ds-9", styleName: "Yoga", level: "All Levels", dayOfWeek: 2, startTime: "10:00", endTime: "11:00", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-11", title: "Yoga Flow", classType: "class", styleId: "ds-9", styleName: "Yoga", level: "All Levels", dayOfWeek: 2, startTime: "11:00", endTime: "12:00", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },

  // ── WEDNESDAY (dayOfWeek=3) ──
  { id: "c-12", title: "Kids Hip Hop", classType: "class", styleId: "ds-10", styleName: "Kids Hip Hop", level: null, dayOfWeek: 3, startTime: "13:30", endTime: "14:30", maxCapacity: 15, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-13", title: "Yoga Strength & Stability", classType: "class", styleId: "ds-9", styleName: "Yoga", level: "Strength & Stability", dayOfWeek: 3, startTime: "17:30", endTime: "18:30", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-14", title: "Cuban Beginners 1", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Beginner 1", dayOfWeek: 3, startTime: "18:30", endTime: "19:30", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-15", title: "Salsa Line Beginners 1", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Beginner 1", dayOfWeek: 3, startTime: "19:30", endTime: "20:30", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-16", title: "Bachata Beginners 1", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Beginner 1", dayOfWeek: 3, startTime: "20:30", endTime: "21:30", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-17", title: "Bachata Intermediate", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Intermediate", dayOfWeek: 3, startTime: "20:30", endTime: "21:30", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-18", title: "Wednesday Social", classType: "social", styleId: null, styleName: null, level: null, dayOfWeek: 3, startTime: "21:30", endTime: "00:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "BPM Studio", isActive: true },

  // ── FRIDAY (dayOfWeek=5) ──
  { id: "c-19", title: "Cuban Improvers", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Improvers", dayOfWeek: 5, startTime: "18:00", endTime: "19:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-20", title: "Cuban Intermediate", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Intermediate", dayOfWeek: 5, startTime: "18:00", endTime: "19:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-21", title: "Salsa Line Improvers", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Improvers", dayOfWeek: 5, startTime: "19:00", endTime: "20:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-22", title: "Salsa Line Intermediate", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Intermediate", dayOfWeek: 5, startTime: "19:00", endTime: "20:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-23", title: "Bachata Traditional", classType: "class", styleId: "ds-2", styleName: "Bachata Tradicional", level: "Open", dayOfWeek: 5, startTime: "20:00", endTime: "21:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-24", title: "Bachata Improvers", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Improvers", dayOfWeek: 5, startTime: "21:00", endTime: "22:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-25", title: "Bachata Intermediate", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Intermediate", dayOfWeek: 5, startTime: "21:00", endTime: "22:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-26", title: "Friday Social", classType: "social", styleId: null, styleName: null, level: null, dayOfWeek: 5, startTime: "22:00", endTime: "01:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "BPM Studio", isActive: true },

  // ── SATURDAY (dayOfWeek=6) ──
  { id: "c-27", title: "Salsa Line Beginners 1", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Beginner 1", dayOfWeek: 6, startTime: "13:00", endTime: "14:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-28", title: "Salsa Line Intermediate", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Intermediate", dayOfWeek: 6, startTime: "13:00", endTime: "14:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-29", title: "Bachata Beginners 1", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Beginner 1", dayOfWeek: 6, startTime: "14:00", endTime: "15:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-30", title: "Bachata Intermediate", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Intermediate", dayOfWeek: 6, startTime: "14:00", endTime: "15:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-31", title: "Student Practice", classType: "student_practice", styleId: null, styleName: null, level: null, dayOfWeek: 6, startTime: "15:00", endTime: "16:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },

  // ── SUNDAY (dayOfWeek=0) ──
  { id: "c-32", title: "Cuban Beginners 1", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Beginner 1", dayOfWeek: 0, startTime: "13:00", endTime: "14:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-33", title: "Salsa Line Intermediate", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Intermediate", dayOfWeek: 0, startTime: "13:00", endTime: "14:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-34", title: "Bachata Beginners 1", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Beginner 1", dayOfWeek: 0, startTime: "14:00", endTime: "15:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true, termBound: true, termId: "term-1" },
  { id: "c-35", title: "Bachata Intermediate", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Intermediate", dayOfWeek: 0, startTime: "14:00", endTime: "15:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-36", title: "Student Practice", classType: "student_practice", styleId: null, styleName: null, level: null, dayOfWeek: 0, startTime: "15:00", endTime: "16:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-37", title: "Yoga Reset & Recovery", classType: "class", styleId: "ds-9", styleName: "Yoga", level: "Reset & Recovery", dayOfWeek: 0, startTime: "17:00", endTime: "18:00", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
];

// ── Teacher Pairs (assignments managed by admin) ────────────

export interface MockTeacherPair {
  id: string;
  classId: string;
  classTitle: string;
  teacher1Id: string;
  teacher2Id: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}

export const TEACHER_PAIRS: MockTeacherPair[] = [];

// ── Bookable Classes (Term 1 Week 1: Mar 30 – Apr 5) ───────

export interface MockBookableClass {
  id: string;
  classId: string | null;
  title: string;
  classType: ClassType;
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: InstanceStatus;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  bookedCount: number;
  leaderCount: number;
  followerCount: number;
  waitlistCount: number;
  location: string;
  notes?: string | null;
  teacherOverride1Id?: string | null;
  teacherOverride2Id?: string | null;
  termBound?: boolean;
  termId?: string | null;
}

export const BOOKABLE_CLASSES: MockBookableClass[] = [
  // ── Monday Mar 30 ──
  { id: "bc-001", classId: "c-01", title: "Yoga Flow", classType: "class", styleName: "Yoga", styleId: "ds-9", level: "All Levels", date: "2026-03-30", startTime: "10:00", endTime: "11:00", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-002", classId: "c-02", title: "Yoga Flow", classType: "class", styleName: "Yoga", styleId: "ds-9", level: "All Levels", date: "2026-03-30", startTime: "11:00", endTime: "12:00", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-003", classId: "c-03", title: "Cuban Improvers", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Improvers", date: "2026-03-30", startTime: "18:30", endTime: "19:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-004", classId: "c-04", title: "Cuban Intermediate", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Intermediate", date: "2026-03-30", startTime: "18:30", endTime: "19:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-005", classId: "c-05", title: "Salsa Line Improvers", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Improvers", date: "2026-03-30", startTime: "19:30", endTime: "20:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-006", classId: "c-06", title: "Salsa Line Intermediate", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Intermediate", date: "2026-03-30", startTime: "19:30", endTime: "20:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-007", classId: "c-07", title: "Bachata Improvers", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Improvers", date: "2026-03-30", startTime: "20:30", endTime: "21:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-008", classId: "c-08", title: "Bachata Intermediate", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Intermediate", date: "2026-03-30", startTime: "20:30", endTime: "21:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-009", classId: "c-09", title: "Monday Social", classType: "social", styleName: null, styleId: null, level: null, date: "2026-03-30", startTime: "21:30", endTime: "00:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "BPM Studio" },

  // ── Tuesday Mar 31 ──
  { id: "bc-010", classId: "c-10", title: "Yoga Flow", classType: "class", styleName: "Yoga", styleId: "ds-9", level: "All Levels", date: "2026-03-31", startTime: "10:00", endTime: "11:00", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-011", classId: "c-11", title: "Yoga Flow", classType: "class", styleName: "Yoga", styleId: "ds-9", level: "All Levels", date: "2026-03-31", startTime: "11:00", endTime: "12:00", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },

  // ── Wednesday Apr 1 ──
  { id: "bc-012", classId: "c-12", title: "Kids Hip Hop", classType: "class", styleName: "Kids Hip Hop", styleId: "ds-10", level: null, date: "2026-04-01", startTime: "13:30", endTime: "14:30", status: "open", maxCapacity: 15, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-013", classId: "c-13", title: "Yoga Strength & Stability", classType: "class", styleName: "Yoga", styleId: "ds-9", level: "Strength & Stability", date: "2026-04-01", startTime: "17:30", endTime: "18:30", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-014", classId: "c-14", title: "Cuban Beginners 1", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Beginner 1", date: "2026-04-01", startTime: "18:30", endTime: "19:30", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-015", classId: "c-15", title: "Salsa Line Beginners 1", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Beginner 1", date: "2026-04-01", startTime: "19:30", endTime: "20:30", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-016", classId: "c-16", title: "Bachata Beginners 1", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Beginner 1", date: "2026-04-01", startTime: "20:30", endTime: "21:30", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-017", classId: "c-17", title: "Bachata Intermediate", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Intermediate", date: "2026-04-01", startTime: "20:30", endTime: "21:30", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-018", classId: "c-18", title: "Wednesday Social", classType: "social", styleName: null, styleId: null, level: null, date: "2026-04-01", startTime: "21:30", endTime: "00:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "BPM Studio" },

  // ── Friday Apr 3 ──
  { id: "bc-019", classId: "c-19", title: "Cuban Improvers", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Improvers", date: "2026-04-03", startTime: "18:00", endTime: "19:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-020", classId: "c-20", title: "Cuban Intermediate", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Intermediate", date: "2026-04-03", startTime: "18:00", endTime: "19:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-021", classId: "c-21", title: "Salsa Line Improvers", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Improvers", date: "2026-04-03", startTime: "19:00", endTime: "20:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-022", classId: "c-22", title: "Salsa Line Intermediate", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Intermediate", date: "2026-04-03", startTime: "19:00", endTime: "20:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-023", classId: "c-23", title: "Bachata Traditional", classType: "class", styleName: "Bachata Tradicional", styleId: "ds-2", level: "Open", date: "2026-04-03", startTime: "20:00", endTime: "21:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-024", classId: "c-24", title: "Bachata Improvers", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Improvers", date: "2026-04-03", startTime: "21:00", endTime: "22:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-025", classId: "c-25", title: "Bachata Intermediate", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Intermediate", date: "2026-04-03", startTime: "21:00", endTime: "22:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-026", classId: "c-26", title: "Friday Social", classType: "social", styleName: null, styleId: null, level: null, date: "2026-04-03", startTime: "22:00", endTime: "01:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "BPM Studio" },

  // ── Saturday Apr 4 ──
  { id: "bc-027", classId: "c-27", title: "Salsa Line Beginners 1", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Beginner 1", date: "2026-04-04", startTime: "13:00", endTime: "14:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-028", classId: "c-28", title: "Salsa Line Intermediate", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Intermediate", date: "2026-04-04", startTime: "13:00", endTime: "14:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-029", classId: "c-29", title: "Bachata Beginners 1", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Beginner 1", date: "2026-04-04", startTime: "14:00", endTime: "15:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-030", classId: "c-30", title: "Bachata Intermediate", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Intermediate", date: "2026-04-04", startTime: "14:00", endTime: "15:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-031", classId: "c-31", title: "Student Practice", classType: "student_practice", styleName: null, styleId: null, level: null, date: "2026-04-04", startTime: "15:00", endTime: "16:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },

  // ── Sunday Apr 5 ──
  { id: "bc-032", classId: "c-32", title: "Cuban Beginners 1", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Beginner 1", date: "2026-04-05", startTime: "13:00", endTime: "14:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-033", classId: "c-33", title: "Salsa Line Intermediate", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Intermediate", date: "2026-04-05", startTime: "13:00", endTime: "14:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-034", classId: "c-34", title: "Bachata Beginners 1", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Beginner 1", date: "2026-04-05", startTime: "14:00", endTime: "15:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A", termBound: true, termId: "term-1" },
  { id: "bc-035", classId: "c-35", title: "Bachata Intermediate", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Intermediate", date: "2026-04-05", startTime: "14:00", endTime: "15:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-036", classId: "c-36", title: "Student Practice", classType: "student_practice", styleName: null, styleId: null, level: null, date: "2026-04-05", startTime: "15:00", endTime: "16:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  { id: "bc-037", classId: "c-37", title: "Yoga Reset & Recovery", classType: "class", styleName: "Yoga", styleId: "ds-9", level: "Reset & Recovery", date: "2026-04-05", startTime: "17:00", endTime: "18:00", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
];

// ── Students ────────────────────────────────────────────────

export interface MockStudent {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  preferredRole: DanceRole | null;
  isActive: boolean;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
  subscriptionName: string | null;
  remainingCredits: number | null;
  joinedAt: string;
  /** Persistent student identity token for QR-based check-in */
  qrToken: string;
}

export const STUDENTS: MockStudent[] = [
  { id: "s-01", fullName: "Alice Murphy", email: "alice@test.com", phone: "+353 86 111 0001", preferredRole: "follower", isActive: true, notes: "Experienced dancer, attends regularly.", emergencyContactName: "Tom Murphy", emergencyContactPhone: "+353 86 222 0001", dateOfBirth: "03-12", subscriptionName: "Gold Standard Membership", remainingCredits: null, joinedAt: "2025-09-01", qrToken: "bpm-a01b02c03d04e05f06a07b08c09d00" },
  { id: "s-02", fullName: "Bob O'Brien", email: "bob@test.com", phone: "+353 86 111 0002", preferredRole: "leader", isActive: true, notes: null, emergencyContactName: null, emergencyContactPhone: null, dateOfBirth: "07-22", subscriptionName: "Silver Bachata Membership", remainingCredits: null, joinedAt: "2025-10-15", qrToken: "bpm-b01c02d03e04f05a06b07c08d09e00" },
  { id: "s-03", fullName: "Carol Walsh", email: "carol@test.com", phone: "+353 86 111 0003", preferredRole: "follower", isActive: true, notes: "Prefers evening classes.", emergencyContactName: "Mary Walsh", emergencyContactPhone: "+353 86 222 0003", dateOfBirth: null, subscriptionName: "Beginners 1 & 2 Promo Pass", remainingCredits: 6, joinedAt: "2026-01-10", qrToken: "bpm-c01d02e03f04a05b06c07d08e09f00" },
  { id: "s-04", fullName: "Dave Keane", email: "dave@test.com", phone: "+353 86 111 0004", preferredRole: "leader", isActive: true, notes: null, emergencyContactName: null, emergencyContactPhone: null, dateOfBirth: "11-05", subscriptionName: "Bronze Standard Membership", remainingCredits: null, joinedAt: "2026-02-01", qrToken: "bpm-d01e02f03a04b05c06d07e08f09a00" },
  { id: "s-05", fullName: "Eve Byrne", email: "eve@test.com", phone: null, preferredRole: "follower", isActive: true, notes: "New student, considering a membership.", emergencyContactName: null, emergencyContactPhone: null, dateOfBirth: "03-20", subscriptionName: null, remainingCredits: null, joinedAt: "2026-03-01", qrToken: "bpm-e01f02a03b04c05d06e07f08a09b00" },
  { id: "s-06", fullName: "Finn Doyle", email: "finn@test.com", phone: "+353 86 111 0006", preferredRole: "leader", isActive: true, notes: null, emergencyContactName: "Sarah Doyle", emergencyContactPhone: "+353 86 222 0006", dateOfBirth: "03-21", subscriptionName: "Rainbow Membership", remainingCredits: null, joinedAt: "2025-06-20", qrToken: "bpm-f01a02b03c04d05e06f07a08b09c00" },
  { id: "s-07", fullName: "Grace Kelly", email: "grace@test.com", phone: "+353 86 111 0007", preferredRole: "follower", isActive: true, notes: null, emergencyContactName: null, emergencyContactPhone: null, dateOfBirth: "06-15", subscriptionName: "Latin Combo (Mix and Match)", remainingCredits: 3, joinedAt: "2025-11-05", qrToken: "bpm-a07b08c09d10e11f12a13b14c15d00" },
  { id: "s-08", fullName: "Hugo Brennan", email: "hugo@test.com", phone: null, preferredRole: "leader", isActive: true, notes: "Has a single drop-in credit.", emergencyContactName: null, emergencyContactPhone: null, dateOfBirth: null, subscriptionName: "Drop In", remainingCredits: 1, joinedAt: "2026-03-10", qrToken: "bpm-b08c09d10e11f12a13b14c15d16e00" },
];

// ── Products (Real BPM catalog) ─────────────────────────────

export interface MockProduct {
  id: string;
  name: string;
  description: string;
  longDescription: string | null;
  productType: ProductType;
  priceCents: number;
  totalCredits: number | null;
  durationDays: number | null;
  styleName: string | null;
  allowedLevels: string[] | null;
  allowedStyleIds: string[] | null;
  allowedStyleNames: string[] | null;
  isActive: boolean;
  isProvisional: boolean;
  notes: string | null;
  validityDescription: string | null;
  creditsModel: CreditsModel;
  termBound: boolean;
  recurring: boolean;
  classesPerTerm: number | null;
  autoRenew: boolean;
  benefits: string[] | null;
  /** Number of terms this product spans (e.g. 2 for Beginners 1 & 2 Promo Pass). */
  spanTerms: number | null;
}

const BRONZE_BENEFITS = ["Free entry to 1 community event per month or weekend Latin practice hours", "Member-exclusive giveaways", "Free class of your choice on your birthday week"];
const SILVER_BENEFITS = [...BRONZE_BENEFITS];
const GOLD_BENEFITS = ["Earlybird access to studio events", "Priority class booking", "Exclusive quarterly event for Gold members", "Special discounts on merchandise and studio events", ...BRONZE_BENEFITS];
const RAINBOW_BENEFITS = [...GOLD_BENEFITS, "Free BPM T-shirt"];

// ── Style-ID constants (single source for seed products + config) ────
const BACHATA_IDS: string[] = ["ds-1", "ds-2"];
const SALSA_IDS:   string[] = ["ds-4", "ds-5"];
const YOGA_IDS:    string[] = ["ds-9"];
const ALL_LATIN_IDS: string[] = [...BACHATA_IDS, ...SALSA_IDS];
const LATIN_COMBO_POOL_IDS: string[] = ["ds-1", "ds-4", "ds-5"];
const STANDARD_MEM_IDS: string[] = ["ds-6", "ds-7", "ds-8", "ds-9", "ds-10"];

const BACHATA_NAMES = ["Bachata", "Bachata Tradicional"];
const SALSA_NAMES   = ["Cuban", "Salsa Line"];
const YOGA_NAMES    = ["Yoga"];
const ALL_LATIN_NAMES = [...BACHATA_NAMES, ...SALSA_NAMES];
const LATIN_COMBO_POOL_NAMES = ["Bachata", "Cuban", "Salsa Line"];
const STANDARD_MEM_NAMES = ["Reggaeton", "Ladies Styling", "Afro-Cuban", "Yoga", "Kids Hip Hop"];

export const PRODUCTS: MockProduct[] = [
  // ── Drop-in ──
  { id: "p-dropin", name: "Drop In", description: "One class pass. Pay at reception.", longDescription: "A single-use class entry valid for any style and any level. Pay at reception or have it assigned by an admin. No term commitment required.", productType: "drop_in", priceCents: 1500, totalCredits: 1, durationDays: null, styleName: "All styles", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Single use", creditsModel: "single_use", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: null, allowedStyleNames: null, spanTerms: null },

  // ── Latin Passes (monthly, selected style) ──
  { id: "p-lat-bronze", name: "Bronze Latin Pass", description: "4 classes per month. One dance style of your choice.", longDescription: "4 classes per month in one dance style of your choice. Pay online or at reception.", productType: "pass", priceCents: 5500, totalCredits: 4, durationDays: 30, styleName: "1 selected style", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: ALL_LATIN_IDS, allowedStyleNames: ALL_LATIN_NAMES, spanTerms: null },
  { id: "p-lat-silver", name: "Silver Latin Pass", description: "8 classes per month. One dance style of your choice.", longDescription: "8 classes per month in one dance style of your choice. Pay online or at reception.", productType: "pass", priceCents: 10500, totalCredits: 8, durationDays: 30, styleName: "1 selected style", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: ALL_LATIN_IDS, allowedStyleNames: ALL_LATIN_NAMES, spanTerms: null },
  { id: "p-lat-gold", name: "Gold Latin Pass", description: "12 classes per month. One dance style of your choice.", longDescription: "12 classes per month in one dance style of your choice. Pay online or at reception.", productType: "pass", priceCents: 15500, totalCredits: 12, durationDays: 30, styleName: "1 selected style", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: ALL_LATIN_IDS, allowedStyleNames: ALL_LATIN_NAMES, spanTerms: null },

  // ── Yoga Passes (monthly, yoga only) ──
  { id: "p-yoga-bronze", name: "Bronze Yoga Pass", description: "4 yoga classes per month.", longDescription: "4 yoga classes per month. Pay online or at reception.", productType: "pass", priceCents: 5500, totalCredits: 4, durationDays: 30, styleName: "Yoga", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: YOGA_IDS, allowedStyleNames: YOGA_NAMES, spanTerms: null },
  { id: "p-yoga-silver", name: "Silver Yoga Pass", description: "8 yoga classes per month.", longDescription: "8 yoga classes per month. Pay online or at reception.", productType: "pass", priceCents: 10500, totalCredits: 8, durationDays: 30, styleName: "Yoga", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: YOGA_IDS, allowedStyleNames: YOGA_NAMES, spanTerms: null },
  { id: "p-yoga-gold", name: "Gold Yoga Pass", description: "12 yoga classes per month.", longDescription: "12 yoga classes per month. Pay online or at reception.", productType: "pass", priceCents: 15500, totalCredits: 12, durationDays: 30, styleName: "Yoga", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: YOGA_IDS, allowedStyleNames: YOGA_NAMES, spanTerms: null },

  // ── Promo / Combo Passes ──
  { id: "p-beg12", name: "Beginners 1 & 2 Promo Pass", description: "8 classes of one dance style. Covers Beginner 1 + 2.", longDescription: "8 classes in one selected dance style covering Beginner 1 and Beginner 2 levels. Spans 2 terms (4 Beginner 1 + 4 Beginner 2). Pay at reception or online.", productType: "pass", priceCents: 10000, totalCredits: 8, durationDays: 56, styleName: "1 selected style", allowedLevels: ["Beginner 1", "Beginner 2"], isActive: true, isProvisional: false, notes: null, validityDescription: "2 terms (8 weeks)", creditsModel: "fixed", termBound: true, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: ALL_LATIN_IDS, allowedStyleNames: ALL_LATIN_NAMES, spanTerms: 2 },
  { id: "p-latin-combo", name: "Latin Combo (Mix and Match)", description: "8 classes. Mix two of our three Beginner 1 courses.", longDescription: "Mix and match two of our three Beginner 1 courses (Bachata, Cuban, Salsa Line). Includes 8 classes. Pay at reception or online.", productType: "pass", priceCents: 9000, totalCredits: 8, durationDays: 56, styleName: "Pick 2 of 3 Latin", allowedLevels: ["Beginner 1"], isActive: true, isProvisional: false, notes: null, validityDescription: "8 weeks fixed", creditsModel: "fixed", termBound: true, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: LATIN_COMBO_POOL_IDS, allowedStyleNames: LATIN_COMBO_POOL_NAMES, spanTerms: null },

  // ── Social Pass ──
  { id: "p-social", name: "Social Pass", description: "20 socials per month. Weekday socials + weekend student practice.", longDescription: "Access to standard weekday socials (Mon, Wed, Fri, and weekend student practice). Includes 20 socials per month. Events are not included.", productType: "pass", priceCents: 10000, totalCredits: 20, durationDays: 30, styleName: "Socials only", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Monthly rolling", creditsModel: "fixed", termBound: false, recurring: false, classesPerTerm: null, autoRenew: false, benefits: null, allowedStyleIds: null, allowedStyleNames: null, spanTerms: null },

  // ── Bronze Memberships (4 classes/month) ──
  { id: "p-mem-bronze-std", name: "Bronze Standard Membership", description: "4 classes per month (excluding Salsa & Bachata classes).", longDescription: "4 classes per month excluding Salsa and Bachata classes. Cash or card with auto-renewal.", productType: "membership", priceCents: 6500, totalCredits: null, durationDays: null, styleName: "Excl. Salsa & Bachata", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 4, autoRenew: true, benefits: BRONZE_BENEFITS, allowedStyleIds: STANDARD_MEM_IDS, allowedStyleNames: STANDARD_MEM_NAMES, spanTerms: null },
  { id: "p-mem-bronze-bach", name: "Bronze Bachata Membership", description: "4 classes per month (Bachata classes only).", longDescription: "4 Bachata classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 6500, totalCredits: null, durationDays: null, styleName: "Bachata", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 4, autoRenew: true, benefits: BRONZE_BENEFITS, allowedStyleIds: BACHATA_IDS, allowedStyleNames: BACHATA_NAMES, spanTerms: null },
  { id: "p-mem-bronze-salsa", name: "Bronze Salsa Membership", description: "4 classes per month (Salsa classes only).", longDescription: "4 Salsa classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 6500, totalCredits: null, durationDays: null, styleName: "Salsa", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 4, autoRenew: true, benefits: BRONZE_BENEFITS, allowedStyleIds: SALSA_IDS, allowedStyleNames: SALSA_NAMES, spanTerms: null },
  { id: "p-mem-bronze-yoga", name: "Bronze Yoga Membership", description: "4 classes per month (Yoga classes only).", longDescription: "4 Yoga classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 6000, totalCredits: null, durationDays: null, styleName: "Yoga", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 4, autoRenew: true, benefits: BRONZE_BENEFITS, allowedStyleIds: YOGA_IDS, allowedStyleNames: YOGA_NAMES, spanTerms: null },

  // ── Silver Memberships (8 classes/month) ──
  { id: "p-mem-silver-std", name: "Silver Standard Membership", description: "8 classes per month (excluding Salsa & Bachata classes).", longDescription: "8 classes per month excluding Salsa and Bachata classes. Cash or card with auto-renewal.", productType: "membership", priceCents: 12000, totalCredits: null, durationDays: null, styleName: "Excl. Salsa & Bachata", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 8, autoRenew: true, benefits: SILVER_BENEFITS, allowedStyleIds: STANDARD_MEM_IDS, allowedStyleNames: STANDARD_MEM_NAMES, spanTerms: null },
  { id: "p-mem-silver-bach", name: "Silver Bachata Membership", description: "8 classes per month (Bachata classes only).", longDescription: "8 Bachata classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 12000, totalCredits: null, durationDays: null, styleName: "Bachata", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 8, autoRenew: true, benefits: SILVER_BENEFITS, allowedStyleIds: BACHATA_IDS, allowedStyleNames: BACHATA_NAMES, spanTerms: null },
  { id: "p-mem-silver-salsa", name: "Silver Salsa Membership", description: "8 classes per month (Salsa classes only).", longDescription: "8 Salsa classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 12000, totalCredits: null, durationDays: null, styleName: "Salsa", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 8, autoRenew: true, benefits: SILVER_BENEFITS, allowedStyleIds: SALSA_IDS, allowedStyleNames: SALSA_NAMES, spanTerms: null },
  { id: "p-mem-silver-yoga", name: "Silver Yoga Membership", description: "8 classes per month (Yoga classes only).", longDescription: "8 Yoga classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 11000, totalCredits: null, durationDays: null, styleName: "Yoga", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 8, autoRenew: true, benefits: SILVER_BENEFITS, allowedStyleIds: YOGA_IDS, allowedStyleNames: YOGA_NAMES, spanTerms: null },

  // ── Gold Memberships (12 classes/month) ──
  { id: "p-mem-gold-std", name: "Gold Standard Membership", description: "12 classes per month (excluding Salsa & Bachata classes).", longDescription: "12 classes per month excluding Salsa and Bachata classes. Cash or card with auto-renewal.", productType: "membership", priceCents: 17000, totalCredits: null, durationDays: null, styleName: "Excl. Salsa & Bachata", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 12, autoRenew: true, benefits: GOLD_BENEFITS, allowedStyleIds: STANDARD_MEM_IDS, allowedStyleNames: STANDARD_MEM_NAMES, spanTerms: null },
  { id: "p-mem-gold-bach", name: "Gold Bachata Membership", description: "12 classes per month (Bachata classes only).", longDescription: "12 Bachata classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 17000, totalCredits: null, durationDays: null, styleName: "Bachata", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 12, autoRenew: true, benefits: GOLD_BENEFITS, allowedStyleIds: BACHATA_IDS, allowedStyleNames: BACHATA_NAMES, spanTerms: null },
  { id: "p-mem-gold-salsa", name: "Gold Salsa Membership", description: "12 classes per month (Salsa classes only).", longDescription: "12 Salsa classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 17000, totalCredits: null, durationDays: null, styleName: "Salsa", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 12, autoRenew: true, benefits: GOLD_BENEFITS, allowedStyleIds: SALSA_IDS, allowedStyleNames: SALSA_NAMES, spanTerms: null },
  { id: "p-mem-gold-yoga", name: "Gold Yoga Membership", description: "12 classes per month (Yoga classes only).", longDescription: "12 Yoga classes per month. Cash or card with auto-renewal.", productType: "membership", priceCents: 16000, totalCredits: null, durationDays: null, styleName: "Yoga", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 12, autoRenew: true, benefits: GOLD_BENEFITS, allowedStyleIds: YOGA_IDS, allowedStyleNames: YOGA_NAMES, spanTerms: null },

  // ── Rainbow Membership (all-access, 16 classes/month) ──
  { id: "p-mem-rainbow", name: "Rainbow Membership", description: "16 classes per month, all styles included.", longDescription: "16 classes per month across all styles. Our all-access membership with maximum flexibility. Cash or card with auto-renewal.", productType: "membership", priceCents: 22000, totalCredits: null, durationDays: null, styleName: "All styles", allowedLevels: null, isActive: true, isProvisional: false, notes: null, validityDescription: "Per term", creditsModel: "unlimited", termBound: true, recurring: true, classesPerTerm: 16, autoRenew: true, benefits: RAINBOW_BENEFITS, allowedStyleIds: null, allowedStyleNames: null, spanTerms: null },
];

// ── Bookings ────────────────────────────────────────────────

export interface MockBooking {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  classTitle: string;
  date: string;
  startTime: string;
  danceRole: DanceRole | null;
  status: BookingStatus;
  subscriptionId: string | null;
  subscriptionName: string | null;
  bookedAt: string;
}

export const BOOKINGS: MockBooking[] = [
  { id: "b-01", bookableClassId: "bc-007", studentId: "s-01", studentName: "Alice Murphy", classTitle: "Bachata Improvers", date: "2026-03-30", startTime: "20:30", danceRole: "follower", status: "confirmed", subscriptionId: "sub-01", subscriptionName: "Gold Standard Membership", bookedAt: "2026-03-25T10:00:00" },
  { id: "b-02", bookableClassId: "bc-007", studentId: "s-02", studentName: "Bob O'Brien", classTitle: "Bachata Improvers", date: "2026-03-30", startTime: "20:30", danceRole: "leader", status: "confirmed", subscriptionId: "sub-02", subscriptionName: "Silver Bachata Membership", bookedAt: "2026-03-25T11:00:00" },
  { id: "b-03", bookableClassId: "bc-016", studentId: "s-03", studentName: "Carol Walsh", classTitle: "Bachata Beginners 1", date: "2026-04-01", startTime: "20:30", danceRole: "follower", status: "confirmed", subscriptionId: "sub-03", subscriptionName: "Beginners 1 & 2 Promo Pass", bookedAt: "2026-03-26T14:00:00" },
  { id: "b-04", bookableClassId: "bc-003", studentId: "s-06", studentName: "Finn Doyle", classTitle: "Cuban Improvers", date: "2026-03-30", startTime: "18:30", danceRole: "leader", status: "confirmed", subscriptionId: "sub-06", subscriptionName: "Rainbow Membership", bookedAt: "2026-03-26T09:00:00" },
  { id: "b-05", bookableClassId: "bc-001", studentId: "s-08", studentName: "Hugo Brennan", classTitle: "Yoga Flow", date: "2026-03-30", startTime: "10:00", danceRole: null, status: "confirmed", subscriptionId: "sub-08", subscriptionName: "Drop In", bookedAt: "2026-03-27T08:00:00" },
];

// ── Waitlist ─────────────────────────────────────────────────

export interface MockWaitlistEntry {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  danceRole: DanceRole | null;
  status: WaitlistStatus;
  position: number;
  joinedAt: string;
}

export const WAITLIST_ENTRIES: MockWaitlistEntry[] = [];

// ── Attendance ──────────────────────────────────────────────

export interface MockAttendance {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  bookingId: string | null;
  classTitle: string;
  date: string;
  status: AttendanceMark;
  checkInMethod: CheckInMethod;
  markedBy: string;
  markedAt: string;
  notes: string | null;
}

export const ATTENDANCE: MockAttendance[] = [];

// ── Penalties ────────────────────────────────────────────────

export interface MockPenalty {
  id: string;
  studentId: string;
  studentName: string;
  bookingId: string | null;
  bookableClassId: string;
  classTitle: string;
  date: string;
  reason: PenaltyReason;
  amountCents: number;
  resolution: PenaltyResolution;
  subscriptionId: string | null;
  creditDeducted: number;
  createdAt: string;
  notes: string | null;
}

export const PENALTIES: MockPenalty[] = [];

// ── Subscriptions ───────────────────────────────────────────

export interface MockSubscription {
  id: string;
  studentId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  selectedStyleId: string | null;
  selectedStyleName: string | null;
  selectedStyleIds: string[] | null;
  selectedStyleNames: string[] | null;
  notes: string | null;
  termId: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: SalePaymentStatus;
  assignedBy: string | null;
  assignedAt: string;
  autoRenew: boolean;
  classesUsed: number;
  classesPerTerm: number | null;
  /** Links to the predecessor subscription this was renewed from (null if original) */
  renewedFromId: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  paymentNotes: string | null;
  collectedBy: string | null;
}

export const SUBSCRIPTIONS: MockSubscription[] = [
  { id: "sub-01", studentId: "s-01", productId: "p-mem-gold-std", productName: "Gold Standard Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-30", validUntil: "2026-04-26", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null, notes: null, termId: "term-1", paymentMethod: "card", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-25T10:00:00", autoRenew: true, classesUsed: 0, classesPerTerm: 12, renewedFromId: null, paidAt: "2026-03-25T10:00:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
  { id: "sub-02", studentId: "s-02", productId: "p-mem-silver-bach", productName: "Silver Bachata Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-30", validUntil: "2026-04-26", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null, notes: null, termId: "term-1", paymentMethod: "cash", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-25T11:30:00", autoRenew: true, classesUsed: 0, classesPerTerm: 8, renewedFromId: null, paidAt: "2026-03-25T11:30:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
  { id: "sub-03", studentId: "s-03", productId: "p-beg12", productName: "Beginners 1 & 2 Promo Pass", productType: "pass", status: "active", totalCredits: 8, remainingCredits: 6, validFrom: "2026-03-30", validUntil: "2026-05-24", selectedStyleId: "ds-1", selectedStyleName: "Bachata", selectedStyleIds: null, selectedStyleNames: null, notes: "Selected Bachata as promo style.", termId: "term-1", paymentMethod: "card", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-25T14:00:00", autoRenew: false, classesUsed: 0, classesPerTerm: null, renewedFromId: null, paidAt: "2026-03-25T14:00:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
  { id: "sub-04", studentId: "s-04", productId: "p-mem-bronze-std", productName: "Bronze Standard Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-30", validUntil: "2026-04-26", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null, notes: null, termId: "term-1", paymentMethod: "bank_transfer", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-24T16:00:00", autoRenew: false, classesUsed: 0, classesPerTerm: 4, renewedFromId: null, paidAt: "2026-03-24T16:00:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
  { id: "sub-05", studentId: "s-05", productId: "p-dropin", productName: "Drop In", productType: "drop_in", status: "active", totalCredits: 1, remainingCredits: 1, validFrom: "2026-03-25", validUntil: null, selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null, notes: "Complimentary trial drop-in.", termId: null, paymentMethod: "complimentary", paymentStatus: "complimentary", assignedBy: "Admin", assignedAt: "2026-03-25T09:00:00", autoRenew: false, classesUsed: 0, classesPerTerm: null, renewedFromId: null, paidAt: null, paymentReference: null, paymentNotes: null, collectedBy: null },
  { id: "sub-06", studentId: "s-06", productId: "p-mem-rainbow", productName: "Rainbow Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-30", validUntil: "2026-04-26", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null, notes: null, termId: "term-1", paymentMethod: "revolut", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-25T09:00:00", autoRenew: true, classesUsed: 0, classesPerTerm: 16, renewedFromId: null, paidAt: "2026-03-25T09:00:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
  { id: "sub-07", studentId: "s-07", productId: "p-latin-combo", productName: "Latin Combo (Mix and Match)", productType: "pass", status: "active", totalCredits: 8, remainingCredits: 3, validFrom: "2026-03-30", validUntil: "2026-05-24", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: ["ds-1", "ds-5"], selectedStyleNames: ["Bachata", "Salsa Line"], notes: null, termId: "term-1", paymentMethod: "manual", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-24T08:00:00", autoRenew: false, classesUsed: 0, classesPerTerm: null, renewedFromId: null, paidAt: "2026-03-24T08:00:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
  { id: "sub-08", studentId: "s-08", productId: "p-dropin", productName: "Drop In", productType: "drop_in", status: "active", totalCredits: 1, remainingCredits: 1, validFrom: "2026-03-25", validUntil: null, selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null, notes: "Single drop-in.", termId: null, paymentMethod: "cash", paymentStatus: "paid", assignedBy: "Admin", assignedAt: "2026-03-25T10:00:00", autoRenew: false, classesUsed: 0, classesPerTerm: null, renewedFromId: null, paidAt: "2026-03-25T10:00:00", paymentReference: null, paymentNotes: null, collectedBy: "Admin" },
];

// ── Wallet Transactions ─────────────────────────────────────

export interface MockWalletTx {
  id: string;
  studentId: string;
  subscriptionId: string | null;
  bookingId: string | null;
  txType: TxType;
  credits: number;
  balanceAfter: number | null;
  description: string;
  createdAt: string;
}

export const WALLET_TRANSACTIONS: MockWalletTx[] = [];
