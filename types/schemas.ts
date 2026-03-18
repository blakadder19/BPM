import { z } from "zod";

// ── Auth ────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// ── Scheduling ──────────────────────────────────────────────

export const createClassSchema = z.object({
  danceStyleId: z.string().uuid().nullable(),
  title: z.string().min(1, "Title is required"),
  classType: z.enum(["class", "social", "student_practice"]),
  level: z.string().nullable(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  maxCapacity: z.number().int().positive().nullable(),
  leaderCap: z.number().int().positive().nullable(),
  followerCap: z.number().int().positive().nullable(),
  location: z.string().nullable(),
});

export const openBookableClassSchema = z.object({
  classId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  maxCapacity: z.number().int().positive().nullable().optional(),
  leaderCap: z.number().int().positive().nullable().optional(),
  followerCap: z.number().int().positive().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ── Bookings ────────────────────────────────────────────────

export const createBookingSchema = z.object({
  bookableClassId: z.string().uuid(),
  danceRole: z.enum(["leader", "follower"]).nullable(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().optional(),
});

// ── Attendance ──────────────────────────────────────────────

export const markAttendanceSchema = z.object({
  bookableClassId: z.string().uuid(),
  records: z.array(
    z.object({
      studentId: z.string().uuid(),
      status: z.enum(["present", "absent", "late", "excused"]),
    })
  ),
});

// ── Commerce ────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  productType: z.enum(["membership", "pass", "drop_in"]),
  priceCents: z.number().int().min(0),
  totalCredits: z.number().int().positive().nullable(),
  durationDays: z.number().int().positive().nullable(),
  danceStyleId: z.string().uuid().nullable(),
  allowedLevels: z.array(z.string()).nullable(),
});

export const assignSubscriptionSchema = z.object({
  studentId: z.string().uuid(),
  productId: z.string().uuid(),
  danceStyleId: z.string().uuid().nullable().optional(),
  allowedLevels: z.array(z.string()).nullable().optional(),
});

// ── Student Booking ─────────────────────────────────────────

export const studentBookingSchema = z.object({
  bookableClassId: z.string().min(1, "Please select a class"),
  fullName: z.string().min(1, "Full name is required").max(100),
  email: z.string().email("Valid email required"),
  phone: z.string().min(1, "Phone number is required"),
  danceRole: z.enum(["leader", "follower"]).nullable(),
  notes: z.string().max(500).optional(),
});

// ── Inferred types ──────────────────────────────────────────

export type StudentBookingInput = z.infer<typeof studentBookingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type OpenBookableClassInput = z.infer<typeof openBookableClassSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>;
