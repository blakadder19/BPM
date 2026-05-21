import type {
  MockSpecialEvent,
  MockEventSession,
  MockEventProduct,
  MockEventPurchase,
} from "@/lib/mock-data";
import type {
  EventStatus,
  EventSessionType,
  EventProductType,
  EventInclusionRule,
  EventPaymentMethod,
  EventPaymentStatus,
} from "@/types/domain";

// ── Event ────────────────────────────────────────────────────

export interface CreateEventData {
  title: string;
  subtitle?: string | null;
  description: string;
  coverImageUrl?: string | null;
  location: string;
  startDate: string;
  endDate: string;
  status?: EventStatus;
  isVisible?: boolean;
  isFeatured?: boolean;
  featuredOnDashboard?: boolean;
  isPublic?: boolean;
  salesOpen?: boolean;
  overallCapacity?: number | null;
  allowReceptionPayment?: boolean;
  /** Phase 4: when set, the event is created in an archived state. Rarely used; most events become archived later via `updateEvent`. */
  archivedAt?: string | null;
}

export type EventPatch = Partial<
  Pick<
    MockSpecialEvent,
    | "title"
    | "subtitle"
    | "description"
    | "coverImageUrl"
    | "location"
    | "startDate"
    | "endDate"
    | "status"
    | "isVisible"
    | "isFeatured"
    | "featuredOnDashboard"
    | "isPublic"
    | "salesOpen"
    | "overallCapacity"
    | "allowReceptionPayment"
    | "archivedAt"
  >
>;

// ── Session ──────────────────────────────────────────────────

export interface CreateSessionData {
  eventId: string;
  title: string;
  sessionType: EventSessionType;
  date: string;
  startTime: string;
  endTime: string;
  teacherName?: string | null;
  room?: string | null;
  capacity?: number | null;
  description?: string | null;
  sortOrder?: number;
}

export type SessionPatch = Partial<
  Pick<
    MockEventSession,
    | "title"
    | "sessionType"
    | "date"
    | "startTime"
    | "endTime"
    | "teacherName"
    | "room"
    | "capacity"
    | "description"
    | "sortOrder"
  >
>;

// ── Event Product ────────────────────────────────────────────

export interface CreateEventProductData {
  eventId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  productType: EventProductType;
  isVisible?: boolean;
  salesOpen?: boolean;
  inclusionRule: EventInclusionRule;
  includedSessionIds?: string[] | null;
  sortOrder?: number;
  membersOnly?: boolean;
}

export type EventProductPatch = Partial<
  Pick<
    MockEventProduct,
    | "name"
    | "description"
    | "priceCents"
    | "productType"
    | "isVisible"
    | "salesOpen"
    | "inclusionRule"
    | "includedSessionIds"
    | "sortOrder"
    | "membersOnly"
  >
>;

// ── Purchase ─────────────────────────────────────────────────

export interface CreatePurchaseData {
  studentId: string | null;
  eventProductId: string;
  eventId: string;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  qrToken?: string | null;
  paymentMethod: EventPaymentMethod;
  paymentStatus?: EventPaymentStatus;
  paymentReference?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  /** Financial snapshot — set at purchase time */
  unitPriceCentsAtPurchase?: number | null;
  originalAmountCents?: number | null;
  discountAmountCents?: number | null;
  paidAmountCents?: number | null;
  currency?: string | null;
  productNameSnapshot?: string | null;
  productTypeSnapshot?: string | null;
  /**
   * Phase 2 — frozen discount snapshot (same shape as
   * `student_subscriptions.applied_discount`). Persists into the
   * `applied_discount` jsonb column added by migration 00066. Pass
   * `null` (default) when no discount was applied.
   */
  appliedDiscount?:
    | import("@/lib/domain/pricing-engine").AppliedDiscountSnapshot
    | null;
}

// ── Repository Interface ─────────────────────────────────────

export interface ISpecialEventRepository {
  // Events
  getAllEvents(): Promise<MockSpecialEvent[]>;
  getEventById(id: string): Promise<MockSpecialEvent | null>;
  createEvent(data: CreateEventData): Promise<MockSpecialEvent>;
  updateEvent(id: string, patch: EventPatch): Promise<MockSpecialEvent | null>;
  deleteEvent(id: string): Promise<boolean>;

  // Sessions
  getSessionsByEvent(eventId: string): Promise<MockEventSession[]>;
  createSession(data: CreateSessionData): Promise<MockEventSession>;
  updateSession(id: string, patch: SessionPatch): Promise<MockEventSession | null>;
  deleteSession(id: string): Promise<boolean>;

  // Event Products
  getProductsByEvent(eventId: string): Promise<MockEventProduct[]>;
  createEventProduct(data: CreateEventProductData): Promise<MockEventProduct>;
  updateEventProduct(id: string, patch: EventProductPatch): Promise<MockEventProduct | null>;
  deleteEventProduct(id: string): Promise<boolean>;

  // Purchases
  getPurchasesByEvent(eventId: string): Promise<MockEventPurchase[]>;
  getPurchasesByStudent(studentId: string): Promise<MockEventPurchase[]>;
  getPurchaseByQrToken(token: string): Promise<MockEventPurchase | null>;
  getPurchaseById(id: string): Promise<MockEventPurchase | null>;
  /** Used by Finance super-admin tooling to enumerate all rows for the candidate scan. */
  getAllPurchases(): Promise<MockEventPurchase[]>;
  createPurchase(data: CreatePurchaseData): Promise<MockEventPurchase>;
  updatePurchasePayment(
    id: string,
    patch: { paymentStatus: EventPaymentStatus; paymentReference?: string | null; receptionMethod?: string | null; paidAt?: string | null; qrToken?: string | null; paidAmountCents?: number | null },
  ): Promise<MockEventPurchase | null>;
  updatePurchaseCheckIn(
    id: string,
    patch: { checkedInAt: string | null; checkedInBy: string | null },
  ): Promise<MockEventPurchase | null>;

  refundPurchase(
    id: string,
    patch: { refundedAt: string; refundedBy: string; refundReason: string | null },
  ): Promise<MockEventPurchase | null>;

  /**
   * Update only the free-text fields used by the super-admin test-marking flow.
   * Reserved for that flow — not for general-purpose notes editing.
   */
  updatePurchaseTestFields(
    id: string,
    patch: { notes?: string | null; paymentReference?: string | null; refundReason?: string | null },
  ): Promise<MockEventPurchase | null>;

  /** Permanently delete a purchase row. Used only by the Finance danger zone. */
  deletePurchase(id: string): Promise<boolean>;

  updatePurchaseEmailTracking(
    id: string,
    patch: { lastEmailType: string; lastEmailSentAt: string; lastEmailSuccess: boolean },
  ): Promise<void>;
}
