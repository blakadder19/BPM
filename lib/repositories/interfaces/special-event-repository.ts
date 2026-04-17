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

  updatePurchaseEmailTracking(
    id: string,
    patch: { lastEmailType: string; lastEmailSentAt: string; lastEmailSuccess: boolean },
  ): Promise<void>;
}
