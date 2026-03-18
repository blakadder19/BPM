// ── Identity ────────────────────────────────────────────────

export type UserRole = "student" | "admin" | "teacher";

export interface Academy {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  address: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  academyId: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DanceRole = "leader" | "follower";

export interface StudentProfile {
  id: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
  preferredRole: DanceRole | null;
  notes: string | null;
}

/** Flattened shape for the Admin Students list and detail panel. */
export interface StudentListItem {
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
  /** PROVISIONAL — will be derived from student_subscriptions join */
  subscriptionName: string | null;
  /** PROVISIONAL — will be derived from student_subscriptions join */
  remainingCredits: number | null;
  joinedAt: string;
}

export interface TeacherProfile {
  id: string;
  bio: string | null;
  specialties: string[] | null;
  isActive: boolean;
}

// ── Scheduling ──────────────────────────────────────────────

export interface DanceStyle {
  id: string;
  name: string;
  requiresRoleBalance: boolean;
  sortOrder: number;
  isActive: boolean;
}

export type ClassType = "class" | "social" | "student_practice";
export type InstanceStatus = "scheduled" | "open" | "closed" | "cancelled";

export interface Class {
  id: string;
  academyId: string;
  danceStyleId: string | null;
  title: string;
  classType: ClassType;
  level: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string | null;
  isActive: boolean;
}

export interface TeacherPair {
  id: string;
  classId: string;
  teacher1Id: string;
  teacher2Id: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}

export interface BookableClass {
  id: string;
  academyId: string;
  classId: string | null;
  danceStyleId: string | null;
  title: string;
  classType: ClassType;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  status: InstanceStatus;
  location: string | null;
  notes: string | null;
}

// ── Bookings ────────────────────────────────────────────────

export type BookingStatus = "confirmed" | "checked_in" | "cancelled";
export type WaitlistStatus = "waiting" | "offered" | "promoted" | "expired";
export type AttendanceMark = "present" | "absent" | "late" | "excused";

/** TODO: add "qr" when QR check-in is implemented */
export type CheckInMethod = "manual" | "qr";

export interface Booking {
  id: string;
  bookableClassId: string;
  studentId: string;
  danceRole: DanceRole | null;
  status: BookingStatus;
  subscriptionId: string | null;
  bookedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface WaitlistEntry {
  id: string;
  bookableClassId: string;
  studentId: string;
  danceRole: DanceRole | null;
  status: WaitlistStatus;
  position: number;
  bookingId: string | null;
  joinedAt: string;
  offeredAt: string | null;
  promotedAt: string | null;
  expiredAt: string | null;
}

export interface Attendance {
  id: string;
  bookableClassId: string;
  studentId: string;
  status: AttendanceMark;
  bookingId: string | null;
  markedBy: string | null;
  markedAt: string;
  notes: string | null;
}

// ── Commerce ────────────────────────────────────────────────

export type ProductType = "membership" | "pack" | "drop_in" | "promo_pass";
export type SubscriptionStatus = "active" | "paused" | "expired" | "exhausted" | "cancelled";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";
export type TxType = "credit_used" | "credit_added" | "credit_refunded" | "credit_expired" | "penalty_charged";

export interface Product {
  id: string;
  academyId: string;
  name: string;
  description: string | null;
  productType: ProductType;
  priceCents: number;
  currency: string;
  totalCredits: number | null;
  durationDays: number | null;
  danceStyleId: string | null;
  allowedLevels: string[] | null;
  isActive: boolean;
  stripePriceId: string | null;
  metadata: Record<string, unknown>;
}

export interface StudentSubscription {
  id: string;
  studentId: string;
  productId: string;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  danceStyleId: string | null;
  allowedLevels: string[] | null;
  stripeSubscriptionId: string | null;
  metadata: Record<string, unknown>;
}

export interface WalletTransaction {
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

export interface Payment {
  id: string;
  academyId: string;
  studentId: string;
  subscriptionId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentId: string | null;
  description: string | null;
}

// ── Ops ─────────────────────────────────────────────────────

export type PenaltyReason = "late_cancel" | "no_show";
export type PenaltyResolution = "credit_deducted" | "monetary_pending" | "waived";

export interface Penalty {
  id: string;
  academyId: string;
  studentId: string;
  bookingId: string | null;
  bookableClassId: string;
  reason: PenaltyReason;
  amountCents: number;
  currency: string;
  paymentId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BusinessRule {
  id: string;
  academyId: string;
  key: string;
  value: unknown;
  description: string | null;
  isProvisional: boolean;
}

export interface AdminTask {
  id: string;
  academyId: string;
  performedBy: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
