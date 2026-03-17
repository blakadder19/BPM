/**
 * Mock data for admin pages.
 * Mirrors the seed.sql structure for consistency.
 * Replace with Supabase queries when connected.
 */

import type {
  AttendanceMark,
  BookingStatus,
  CheckInMethod,
  ClassType,
  DanceRole,
  InstanceStatus,
  PenaltyReason,
  PenaltyResolution,
  ProductType,
  SubscriptionStatus,
  TxType,
  WaitlistStatus,
} from "@/types/domain";

// ── Dance Styles ────────────────────────────────────────────

export interface MockDanceStyle {
  id: string;
  name: string;
  requiresRoleBalance: boolean;
}

export const DANCE_STYLES: MockDanceStyle[] = [
  { id: "ds-1", name: "Bachata", requiresRoleBalance: true },
  { id: "ds-2", name: "Bachata Tradicional", requiresRoleBalance: true },
  { id: "ds-3", name: "Bachata Partnerwork", requiresRoleBalance: true },
  { id: "ds-4", name: "Cuban", requiresRoleBalance: true },
  { id: "ds-5", name: "Salsa Line", requiresRoleBalance: true },
  { id: "ds-6", name: "Reggaeton", requiresRoleBalance: false },
  { id: "ds-7", name: "Ladies Styling", requiresRoleBalance: false },
  { id: "ds-8", name: "Afro-Cuban", requiresRoleBalance: false },
];

const styleMap = Object.fromEntries(DANCE_STYLES.map((s) => [s.id, s.name]));

export function styleRequiresRoleBalance(styleName: string | null): boolean {
  if (!styleName) return false;
  return DANCE_STYLES.find((s) => s.name === styleName)?.requiresRoleBalance ?? false;
}

// ── Class Templates ─────────────────────────────────────────

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
}

export const CLASSES: MockClass[] = [
  { id: "c-01", title: "Bachata Beginner 1", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Beginner 1", dayOfWeek: 1, startTime: "19:00", endTime: "20:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-02", title: "Cuban Beginner 2", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Beginner 2", dayOfWeek: 1, startTime: "19:00", endTime: "20:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio B", isActive: true },
  { id: "c-03", title: "Bachata Beginner 2", classType: "class", styleId: "ds-1", styleName: "Bachata", level: "Beginner 2", dayOfWeek: 1, startTime: "20:00", endTime: "21:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-04", title: "Cuban Intermediate", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Intermediate", dayOfWeek: 1, startTime: "20:00", endTime: "21:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio B", isActive: true },
  { id: "c-05", title: "Salsa Line Beginner 1", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Beginner 1", dayOfWeek: 2, startTime: "19:00", endTime: "20:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-06", title: "Salsa Line Beginner 2", classType: "class", styleId: "ds-5", styleName: "Salsa Line", level: "Beginner 2", dayOfWeek: 2, startTime: "20:00", endTime: "21:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-07", title: "Reggaeton Open", classType: "class", styleId: "ds-6", styleName: "Reggaeton", level: "Open", dayOfWeek: 2, startTime: "20:00", endTime: "21:00", maxCapacity: 25, leaderCap: null, followerCap: null, location: "Studio B", isActive: true },
  { id: "c-08", title: "Bachata Tradicional Beg 1", classType: "class", styleId: "ds-2", styleName: "Bachata Tradicional", level: "Beginner 1", dayOfWeek: 3, startTime: "19:00", endTime: "20:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-09", title: "Bachata Partnerwork Int", classType: "class", styleId: "ds-3", styleName: "Bachata Partnerwork", level: "Intermediate", dayOfWeek: 3, startTime: "20:00", endTime: "21:00", maxCapacity: 16, leaderCap: 8, followerCap: 8, location: "Studio A", isActive: true },
  { id: "c-10", title: "Cuban Beginner 1", classType: "class", styleId: "ds-4", styleName: "Cuban", level: "Beginner 1", dayOfWeek: 4, startTime: "19:00", endTime: "20:00", maxCapacity: 20, leaderCap: 10, followerCap: 10, location: "Studio A", isActive: true },
  { id: "c-11", title: "Ladies Styling Open", classType: "class", styleId: "ds-7", styleName: "Ladies Styling", level: "Open", dayOfWeek: 4, startTime: "20:00", endTime: "21:00", maxCapacity: 20, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-12", title: "BPM Friday Social", classType: "social", styleId: null, styleName: null, level: null, dayOfWeek: 5, startTime: "21:00", endTime: "01:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "BPM Studio", isActive: true },
  { id: "c-13", title: "Student Practice", classType: "student_practice", styleId: null, styleName: null, level: null, dayOfWeek: 6, startTime: "14:00", endTime: "15:00", maxCapacity: null, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
  { id: "c-14", title: "Afro-Cuban Open", classType: "class", styleId: "ds-8", styleName: "Afro-Cuban", level: "Open", dayOfWeek: 6, startTime: "15:00", endTime: "16:00", maxCapacity: 20, leaderCap: null, followerCap: null, location: "Studio A", isActive: true },
];

// ── Teacher Pairs ───────────────────────────────────────────

export interface MockTeacherPair {
  id: string;
  classId: string;
  classTitle: string;
  teacher1: string;
  teacher2: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}

export const TEACHER_PAIRS: MockTeacherPair[] = [
  { id: "tp-01", classId: "c-01", classTitle: "Bachata Beginner 1", teacher1: "María García", teacher2: "Carlos Rivera", effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-02", classId: "c-02", classTitle: "Cuban Beginner 2", teacher1: "Carlos Rivera", teacher2: null, effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-03", classId: "c-03", classTitle: "Bachata Beginner 2", teacher1: "María García", teacher2: "Carlos Rivera", effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-04", classId: "c-04", classTitle: "Cuban Intermediate", teacher1: "Carlos Rivera", teacher2: null, effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-05", classId: "c-05", classTitle: "Salsa Line Beginner 1", teacher1: "María García", teacher2: null, effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-06", classId: "c-06", classTitle: "Salsa Line Beginner 2", teacher1: "María García", teacher2: null, effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-07", classId: "c-08", classTitle: "Bachata Tradicional Beg 1", teacher1: "María García", teacher2: "Carlos Rivera", effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-08", classId: "c-09", classTitle: "Bachata Partnerwork Int", teacher1: "María García", teacher2: "Carlos Rivera", effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-09", classId: "c-10", classTitle: "Cuban Beginner 1", teacher1: "Carlos Rivera", teacher2: null, effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
  { id: "tp-10", classId: "c-14", classTitle: "Afro-Cuban Open", teacher1: "Carlos Rivera", teacher2: null, effectiveFrom: "2025-01-01", effectiveUntil: null, isActive: true },
];

// ── Bookable Classes ────────────────────────────────────────

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
}

export const BOOKABLE_CLASSES: MockBookableClass[] = [
  // Past week (closed)
  { id: "bc-01", classId: "c-01", title: "Bachata Beginner 1", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Beginner 1", date: "2026-03-09", startTime: "19:00", endTime: "20:00", status: "closed", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 18, leaderCount: 9, followerCount: 9, waitlistCount: 0, location: "Studio A" },
  { id: "bc-02", classId: "c-05", title: "Salsa Line Beginner 1", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Beginner 1", date: "2026-03-10", startTime: "19:00", endTime: "20:00", status: "closed", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 14, leaderCount: 7, followerCount: 7, waitlistCount: 0, location: "Studio A" },
  { id: "bc-03", classId: "c-12", title: "BPM Friday Social", classType: "social", styleName: null, styleId: null, level: null, date: "2026-03-13", startTime: "21:00", endTime: "01:00", status: "closed", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "BPM Studio" },
  // This week
  { id: "bc-04", classId: "c-01", title: "Bachata Beginner 1", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Beginner 1", date: "2026-03-16", startTime: "19:00", endTime: "20:00", status: "closed", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 20, leaderCount: 10, followerCount: 10, waitlistCount: 2, location: "Studio A" },
  { id: "bc-05", classId: "c-02", title: "Cuban Beginner 2", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Beginner 2", date: "2026-03-16", startTime: "19:00", endTime: "20:00", status: "closed", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 12, leaderCount: 6, followerCount: 6, waitlistCount: 0, location: "Studio B" },
  { id: "bc-06", classId: "c-05", title: "Salsa Line Beginner 1", classType: "class", styleName: "Salsa Line", styleId: "ds-5", level: "Beginner 1", date: "2026-03-17", startTime: "19:00", endTime: "20:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 8, leaderCount: 4, followerCount: 4, waitlistCount: 0, location: "Studio A" },
  { id: "bc-07", classId: "c-07", title: "Reggaeton Open", classType: "class", styleName: "Reggaeton", styleId: "ds-6", level: "Open", date: "2026-03-17", startTime: "20:00", endTime: "21:00", status: "open", maxCapacity: 25, leaderCap: null, followerCap: null, bookedCount: 11, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio B" },
  { id: "bc-08", classId: "c-08", title: "Bachata Tradicional Beg 1", classType: "class", styleName: "Bachata Tradicional", styleId: "ds-2", level: "Beginner 1", date: "2026-03-18", startTime: "19:00", endTime: "20:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 6, leaderCount: 3, followerCount: 3, waitlistCount: 0, location: "Studio A" },
  { id: "bc-09", classId: "c-10", title: "Cuban Beginner 1", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Beginner 1", date: "2026-03-19", startTime: "19:00", endTime: "20:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 10, leaderCount: 5, followerCount: 5, waitlistCount: 0, location: "Studio A" },
  { id: "bc-10", classId: "c-12", title: "BPM Friday Social", classType: "social", styleName: null, styleId: null, level: null, date: "2026-03-20", startTime: "21:00", endTime: "01:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "BPM Studio" },
  { id: "bc-11", classId: "c-13", title: "Student Practice", classType: "student_practice", styleName: null, styleId: null, level: null, date: "2026-03-21", startTime: "14:00", endTime: "15:00", status: "scheduled", maxCapacity: null, leaderCap: null, followerCap: null, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
  // Next week (open)
  { id: "bc-12", classId: "c-01", title: "Bachata Beginner 1", classType: "class", styleName: "Bachata", styleId: "ds-1", level: "Beginner 1", date: "2026-03-23", startTime: "19:00", endTime: "20:00", status: "open", maxCapacity: 20, leaderCap: 10, followerCap: 10, bookedCount: 4, leaderCount: 2, followerCount: 2, waitlistCount: 0, location: "Studio A" },
  { id: "bc-13", classId: "c-04", title: "Cuban Intermediate", classType: "class", styleName: "Cuban", styleId: "ds-4", level: "Intermediate", date: "2026-03-23", startTime: "20:00", endTime: "21:00", status: "open", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 2, leaderCount: 1, followerCount: 1, waitlistCount: 0, location: "Studio B" },
  { id: "bc-14", classId: "c-09", title: "Bachata Partnerwork Int", classType: "class", styleName: "Bachata Partnerwork", styleId: "ds-3", level: "Intermediate", date: "2026-03-25", startTime: "20:00", endTime: "21:00", status: "scheduled", maxCapacity: 16, leaderCap: 8, followerCap: 8, bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0, location: "Studio A" },
];

// ── Students ────────────────────────────────────────────────

export interface MockStudent {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  preferredRole: DanceRole | null;
  subscriptionName: string | null;
  remainingCredits: number | null;
  joinedAt: string;
}

export const STUDENTS: MockStudent[] = [
  { id: "s-01", fullName: "Alice Murphy", email: "alice@test.com", phone: "+353 86 111 0001", preferredRole: "follower", subscriptionName: "Gold Membership", remainingCredits: null, joinedAt: "2025-09-01" },
  { id: "s-02", fullName: "Bob O'Brien", email: "bob@test.com", phone: "+353 86 111 0002", preferredRole: "leader", subscriptionName: "Silver Membership", remainingCredits: null, joinedAt: "2025-10-15" },
  { id: "s-03", fullName: "Carol Walsh", email: "carol@test.com", phone: "+353 86 111 0003", preferredRole: "follower", subscriptionName: "Beginners 1 & 2 Promo Pass", remainingCredits: 12, joinedAt: "2026-01-10" },
  { id: "s-04", fullName: "Dave Keane", email: "dave@test.com", phone: "+353 86 111 0004", preferredRole: "leader", subscriptionName: "Bronze Membership", remainingCredits: null, joinedAt: "2026-02-01" },
  { id: "s-05", fullName: "Eve Byrne", email: "eve@test.com", phone: null, preferredRole: "follower", subscriptionName: null, remainingCredits: null, joinedAt: "2026-03-01" },
  { id: "s-06", fullName: "Finn Doyle", email: "finn@test.com", phone: "+353 86 111 0006", preferredRole: "leader", subscriptionName: "Rainbow Membership", remainingCredits: null, joinedAt: "2025-06-20" },
  { id: "s-07", fullName: "Grace Kelly", email: "grace@test.com", phone: "+353 86 111 0007", preferredRole: "follower", subscriptionName: "Beginners Latin Combo", remainingCredits: 3, joinedAt: "2025-11-05" },
  { id: "s-08", fullName: "Hugo Brennan", email: "hugo@test.com", phone: null, preferredRole: "leader", subscriptionName: "Drop In", remainingCredits: 1, joinedAt: "2026-03-10" },
];

// ── Products ────────────────────────────────────────────────

export interface MockProduct {
  id: string;
  name: string;
  description: string;
  productType: ProductType;
  priceCents: number;
  totalCredits: number | null;
  durationDays: number | null;
  styleName: string | null;
  allowedLevels: string[] | null;
  isActive: boolean;
  isProvisional: boolean;
}

export const PRODUCTS: MockProduct[] = [
  // Memberships
  { id: "p-bronze", name: "Bronze Membership", description: "PROVISIONAL — exact style/usage limits pending confirmation.", productType: "membership", priceCents: 4500, totalCredits: null, durationDays: 30, styleName: "All (provisional)", allowedLevels: null, isActive: true, isProvisional: true },
  { id: "p-silver", name: "Silver Membership", description: "PROVISIONAL — exact style/usage limits pending confirmation.", productType: "membership", priceCents: 6500, totalCredits: null, durationDays: 30, styleName: "All (provisional)", allowedLevels: null, isActive: true, isProvisional: true },
  { id: "p-gold", name: "Gold Membership", description: "PROVISIONAL — exact style/usage limits pending confirmation.", productType: "membership", priceCents: 8000, totalCredits: null, durationDays: 30, styleName: "All (provisional)", allowedLevels: null, isActive: true, isProvisional: true },
  { id: "p-rainbow", name: "Rainbow Membership", description: "PROVISIONAL — currently treated as all-styles unlimited.", productType: "membership", priceCents: 9500, totalCredits: null, durationDays: 30, styleName: "All (provisional)", allowedLevels: null, isActive: true, isProvisional: true },
  // Yoga
  { id: "p-yoga-bronze", name: "Yoga Bronze", description: "Yoga-only membership. Yoga classes not yet in schedule.", productType: "membership", priceCents: 3500, totalCredits: null, durationDays: 30, styleName: "Yoga only", allowedLevels: null, isActive: true, isProvisional: true },
  { id: "p-yoga-silver", name: "Yoga Silver", description: "Yoga-only membership. Yoga classes not yet in schedule.", productType: "membership", priceCents: 5000, totalCredits: null, durationDays: 30, styleName: "Yoga only", allowedLevels: null, isActive: true, isProvisional: true },
  { id: "p-yoga-gold", name: "Yoga Gold", description: "Yoga-only membership. Yoga classes not yet in schedule.", productType: "membership", priceCents: 6500, totalCredits: null, durationDays: 30, styleName: "Yoga only", allowedLevels: null, isActive: true, isProvisional: true },
  // Drop-in
  { id: "p-dropin", name: "Drop In", description: "One-time class entry, any style.", productType: "drop_in", priceCents: 1000, totalCredits: 1, durationDays: 30, styleName: "All styles", allowedLevels: null, isActive: true, isProvisional: false },
  // Promo passes
  { id: "p-beg12", name: "Beginners 1 & 2 Promo Pass", description: "Beg 1 + Beg 2 for ONE selected style. Valid 8 weeks.", productType: "promo_pass", priceCents: 2500, totalCredits: 16, durationDays: 56, styleName: "1 selected style", allowedLevels: ["Beginner 1", "Beginner 2"], isActive: true, isProvisional: false },
  { id: "p-latin-combo", name: "Beginners Latin Combo", description: "Beg 1 in TWO of three Latin styles. Valid 8 weeks.", productType: "promo_pass", priceCents: 3500, totalCredits: 16, durationDays: 56, styleName: "Pick 2 of 3 Latin", allowedLevels: ["Beginner 1"], isActive: true, isProvisional: true },
  // Social
  { id: "p-social", name: "Social Pass", description: "Entry to social events. Socials are not part of the class booking flow.", productType: "pack", priceCents: 2000, totalCredits: 4, durationDays: 30, styleName: "Socials only", allowedLevels: null, isActive: true, isProvisional: false },
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
  subscriptionName: string | null;
  bookedAt: string;
}

export const BOOKINGS: MockBooking[] = [
  { id: "b-01", bookableClassId: "bc-04", studentId: "s-01", studentName: "Alice Murphy", classTitle: "Bachata Beginner 1", date: "2026-03-16", startTime: "19:00", danceRole: "follower", status: "confirmed", subscriptionName: "Monthly Unlimited", bookedAt: "2026-03-14T10:00:00" },
  { id: "b-02", bookableClassId: "bc-04", studentId: "s-02", studentName: "Bob O'Brien", classTitle: "Bachata Beginner 1", date: "2026-03-16", startTime: "19:00", danceRole: "leader", status: "confirmed", subscriptionName: "10-Class Pack", bookedAt: "2026-03-14T11:30:00" },
  { id: "b-03", bookableClassId: "bc-04", studentId: "s-03", studentName: "Carol Walsh", classTitle: "Bachata Beginner 1", date: "2026-03-16", startTime: "19:00", danceRole: "follower", status: "confirmed", subscriptionName: "Beginners 1 & 2 Pass", bookedAt: "2026-03-14T14:00:00" },
  { id: "b-04", bookableClassId: "bc-04", studentId: "s-06", studentName: "Finn Doyle", classTitle: "Bachata Beginner 1", date: "2026-03-16", startTime: "19:00", danceRole: "leader", status: "confirmed", subscriptionName: "Monthly Unlimited", bookedAt: "2026-03-15T09:00:00" },
  { id: "b-05", bookableClassId: "bc-04", studentId: "s-04", studentName: "Dave Keane", classTitle: "Bachata Beginner 1", date: "2026-03-16", startTime: "19:00", danceRole: "leader", status: "cancelled", subscriptionName: "5-Class Pack", bookedAt: "2026-03-14T16:00:00" },
  { id: "b-06", bookableClassId: "bc-05", studentId: "s-07", studentName: "Grace Kelly", classTitle: "Cuban Beginner 2", date: "2026-03-16", startTime: "19:00", danceRole: "follower", status: "confirmed", subscriptionName: "10-Class Pack", bookedAt: "2026-03-15T08:00:00" },
  { id: "b-07", bookableClassId: "bc-06", studentId: "s-01", studentName: "Alice Murphy", classTitle: "Salsa Line Beginner 1", date: "2026-03-17", startTime: "19:00", danceRole: "follower", status: "confirmed", subscriptionName: "Monthly Unlimited", bookedAt: "2026-03-15T12:00:00" },
  { id: "b-08", bookableClassId: "bc-07", studentId: "s-08", studentName: "Hugo Brennan", classTitle: "Reggaeton Open", date: "2026-03-17", startTime: "20:00", danceRole: null, status: "confirmed", subscriptionName: "Single Class Drop-in", bookedAt: "2026-03-16T10:00:00" },
  { id: "b-09", bookableClassId: "bc-12", studentId: "s-02", studentName: "Bob O'Brien", classTitle: "Bachata Beginner 1", date: "2026-03-23", startTime: "19:00", danceRole: "leader", status: "confirmed", subscriptionName: "10-Class Pack", bookedAt: "2026-03-17T07:00:00" },
  { id: "b-10", bookableClassId: "bc-12", studentId: "s-05", studentName: "Eve Byrne", classTitle: "Bachata Beginner 1", date: "2026-03-23", startTime: "19:00", danceRole: "follower", status: "confirmed", subscriptionName: null, bookedAt: "2026-03-17T08:30:00" },
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

export const WAITLIST_ENTRIES: MockWaitlistEntry[] = [
  { id: "wl-01", bookableClassId: "bc-04", studentId: "s-08", studentName: "Hugo Brennan", danceRole: "leader", status: "waiting", position: 1, joinedAt: "2026-03-15T17:00:00" },
  { id: "wl-02", bookableClassId: "bc-04", studentId: "s-05", studentName: "Eve Byrne", danceRole: "follower", status: "waiting", position: 2, joinedAt: "2026-03-15T18:30:00" },
];

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
  /** TODO: "qr" path will be used when QR check-in is added */
  checkInMethod: CheckInMethod;
  markedBy: string;
  markedAt: string;
  notes: string | null;
}

export const ATTENDANCE: MockAttendance[] = [
  { id: "a-01", bookableClassId: "bc-01", studentId: "s-01", studentName: "Alice Murphy", bookingId: null, classTitle: "Bachata Beginner 1", date: "2026-03-09", status: "present", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-09T20:05:00", notes: null },
  { id: "a-02", bookableClassId: "bc-01", studentId: "s-02", studentName: "Bob O'Brien", bookingId: null, classTitle: "Bachata Beginner 1", date: "2026-03-09", status: "present", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-09T20:05:00", notes: null },
  { id: "a-03", bookableClassId: "bc-01", studentId: "s-03", studentName: "Carol Walsh", bookingId: null, classTitle: "Bachata Beginner 1", date: "2026-03-09", status: "late", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-09T20:05:00", notes: null },
  { id: "a-04", bookableClassId: "bc-01", studentId: "s-04", studentName: "Dave Keane", bookingId: null, classTitle: "Bachata Beginner 1", date: "2026-03-09", status: "absent", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-09T20:05:00", notes: null },
  { id: "a-05", bookableClassId: "bc-01", studentId: "s-06", studentName: "Finn Doyle", bookingId: null, classTitle: "Bachata Beginner 1", date: "2026-03-09", status: "present", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-09T20:05:00", notes: null },
  { id: "a-06", bookableClassId: "bc-02", studentId: "s-07", studentName: "Grace Kelly", bookingId: null, classTitle: "Salsa Line Beginner 1", date: "2026-03-10", status: "present", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-10T20:05:00", notes: null },
  { id: "a-07", bookableClassId: "bc-02", studentId: "s-01", studentName: "Alice Murphy", bookingId: null, classTitle: "Salsa Line Beginner 1", date: "2026-03-10", status: "present", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-10T20:05:00", notes: null },
  { id: "a-08", bookableClassId: "bc-02", studentId: "s-08", studentName: "Hugo Brennan", bookingId: null, classTitle: "Salsa Line Beginner 1", date: "2026-03-10", status: "absent", checkInMethod: "manual", markedBy: "María García", markedAt: "2026-03-10T20:05:00", notes: null },
];

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
}

export const PENALTIES: MockPenalty[] = [
  { id: "pen-01", studentId: "s-04", studentName: "Dave Keane", bookingId: "b-04", bookableClassId: "bc-01", classTitle: "Bachata Beginner 1", date: "2026-03-09", reason: "no_show", amountCents: 500, resolution: "monetary_pending", subscriptionId: null, creditDeducted: 0, createdAt: "2026-03-09T20:10:00" },
  { id: "pen-02", studentId: "s-08", studentName: "Hugo Brennan", bookingId: "b-08", bookableClassId: "bc-02", classTitle: "Salsa Line Beginner 1", date: "2026-03-10", reason: "no_show", amountCents: 500, resolution: "credit_deducted", subscriptionId: "sub-08", creditDeducted: 1, createdAt: "2026-03-10T20:10:00" },
  { id: "pen-03", studentId: "s-04", studentName: "Dave Keane", bookingId: "b-14", bookableClassId: "bc-04", classTitle: "Bachata Beginner 1", date: "2026-03-16", reason: "late_cancel", amountCents: 200, resolution: "monetary_pending", subscriptionId: null, creditDeducted: 0, createdAt: "2026-03-16T15:00:00" },
];

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
}

export const SUBSCRIPTIONS: MockSubscription[] = [
  // Alice Murphy — Gold Membership (unlimited, all classes)
  { id: "sub-01", studentId: "s-01", productId: "p-gold", productName: "Gold Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-01", validUntil: "2026-03-31", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null },
  // Bob O'Brien — Silver Membership
  { id: "sub-02", studentId: "s-02", productId: "p-silver", productName: "Silver Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-01", validUntil: "2026-03-31", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null },
  // Carol Walsh — Beginners 1 & 2 Promo Pass (selected Bachata)
  { id: "sub-03", studentId: "s-03", productId: "p-beg12", productName: "Beginners 1 & 2 Promo Pass", productType: "promo_pass", status: "active", totalCredits: 16, remainingCredits: 12, validFrom: "2026-01-12", validUntil: "2026-03-08", selectedStyleId: "ds-1", selectedStyleName: "Bachata", selectedStyleIds: null, selectedStyleNames: null },
  // Dave Keane — Bronze Membership
  { id: "sub-04", studentId: "s-04", productId: "p-bronze", productName: "Bronze Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-01", validUntil: "2026-03-31", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null },
  // Eve Byrne — no subscription
  // Finn Doyle — Rainbow Membership
  { id: "sub-06", studentId: "s-06", productId: "p-rainbow", productName: "Rainbow Membership", productType: "membership", status: "active", totalCredits: null, remainingCredits: null, validFrom: "2026-03-01", validUntil: "2026-03-31", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null },
  // Grace Kelly — Beginners Latin Combo (Bachata + Salsa Line)
  { id: "sub-07", studentId: "s-07", productId: "p-latin-combo", productName: "Beginners Latin Combo", productType: "promo_pass", status: "active", totalCredits: 16, remainingCredits: 3, validFrom: "2026-01-15", validUntil: "2026-03-12", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: ["ds-1", "ds-5"], selectedStyleNames: ["Bachata", "Salsa Line"] },
  // Hugo Brennan — Drop In
  { id: "sub-08", studentId: "s-08", productId: "p-dropin", productName: "Drop In", productType: "drop_in", status: "active", totalCredits: 1, remainingCredits: 1, validFrom: "2026-03-10", validUntil: "2026-04-09", selectedStyleId: null, selectedStyleName: null, selectedStyleIds: null, selectedStyleNames: null },
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

export const WALLET_TRANSACTIONS: MockWalletTx[] = [
  { id: "tx-01", studentId: "s-03", subscriptionId: "sub-03", bookingId: "b-03", txType: "credit_used", credits: -1, balanceAfter: 15, description: "Credit used for Bachata Beginner 1 (Beginners 1 & 2 Promo Pass)", createdAt: "2026-01-14T14:00:00" },
  { id: "tx-02", studentId: "s-03", subscriptionId: "sub-03", bookingId: null, txType: "credit_used", credits: -1, balanceAfter: 14, description: "Credit used for Bachata Beginner 2 (Beginners 1 & 2 Promo Pass)", createdAt: "2026-01-14T20:15:00" },
  { id: "tx-03", studentId: "s-03", subscriptionId: "sub-03", bookingId: null, txType: "credit_used", credits: -1, balanceAfter: 13, description: "Credit used for Bachata Beginner 1 (Beginners 1 & 2 Promo Pass)", createdAt: "2026-01-21T19:10:00" },
  { id: "tx-04", studentId: "s-03", subscriptionId: "sub-03", bookingId: null, txType: "credit_used", credits: -1, balanceAfter: 12, description: "Credit used for Bachata Beginner 2 (Beginners 1 & 2 Promo Pass)", createdAt: "2026-01-21T20:10:00" },
  { id: "tx-05", studentId: "s-07", subscriptionId: "sub-07", bookingId: null, txType: "credit_used", credits: -1, balanceAfter: 5, description: "Credit used for Bachata Beginner 1 (Beginners Latin Combo)", createdAt: "2026-02-24T19:05:00" },
  { id: "tx-06", studentId: "s-07", subscriptionId: "sub-07", bookingId: null, txType: "credit_used", credits: -1, balanceAfter: 4, description: "Credit used for Salsa Line Beginner 1 (Beginners Latin Combo)", createdAt: "2026-02-25T19:05:00" },
  { id: "tx-07", studentId: "s-07", subscriptionId: "sub-07", bookingId: null, txType: "credit_used", credits: -1, balanceAfter: 3, description: "Credit used for Bachata Beginner 1 (Beginners Latin Combo)", createdAt: "2026-03-03T19:05:00" },
  { id: "tx-08", studentId: "s-08", subscriptionId: "sub-08", bookingId: "b-08", txType: "credit_used", credits: -1, balanceAfter: 0, description: "Credit used for Reggaeton Open (Drop In)", createdAt: "2026-03-17T20:05:00" },
];
