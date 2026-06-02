import type { MockSubscription } from "@/lib/mock-data";
import type { SubscriptionProductSnapshot } from "@/lib/domain/subscription-snapshot";
import type { AppliedDiscountSnapshot } from "@/lib/domain/pricing-engine";
import type {
  PaymentMethod,
  ProductType,
  SalePaymentStatus,
  SubscriptionStatus,
} from "@/types/domain";

export interface CreateSubscriptionData {
  studentId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  termId: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus?: SalePaymentStatus;
  assignedBy?: string | null;
  assignedAt?: string;
  autoRenew: boolean;
  classesUsed: number;
  classesPerTerm: number | null;
  selectedStyleId?: string | null;
  selectedStyleName?: string | null;
  selectedStyleIds?: string[] | null;
  selectedStyleNames?: string[] | null;
  renewedFromId?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  paymentNotes?: string | null;
  collectedBy?: string | null;
  priceCentsAtPurchase?: number | null;
  currencyAtPurchase?: string;
  /** Phase 1 — frozen product/access snapshot at purchase time. */
  productSnapshot?: SubscriptionProductSnapshot | null;
  /** Phase 4 — list price (BEFORE discount). */
  originalPriceCents?: number | null;
  /** Phase 4 — total discount applied at purchase time. */
  discountAmountCents?: number;
  /** Phase 4 — frozen applied-discount snapshot (null when no discount). */
  appliedDiscount?: AppliedDiscountSnapshot | null;
  /** Manual admin-applied discount in cents. 0 = none. Requires `payments:manual_adjustment`. */
  manualDiscountCents?: number;
  /** Reason for the manual discount. Required at the action layer when manualDiscountCents > 0. */
  manualDiscountReason?: string | null;
  /** Auth user id of the admin who authorised the manual discount. */
  manualDiscountBy?: string | null;
}

export interface SubscriptionPatch {
  productName?: string;
  status?: SubscriptionStatus;
  totalCredits?: number | null;
  remainingCredits?: number | null;
  validFrom?: string;
  validUntil?: string | null;
  notes?: string | null;
  termId?: string | null;
  paymentMethod?: PaymentMethod;
  paymentStatus?: SalePaymentStatus;
  autoRenew?: boolean;
  classesUsed?: number;
  classesPerTerm?: number | null;
  selectedStyleId?: string | null;
  selectedStyleName?: string | null;
  selectedStyleIds?: string[] | null;
  selectedStyleNames?: string[] | null;
  renewedFromId?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  paymentNotes?: string | null;
  collectedBy?: string | null;
  refundedAt?: string | null;
  refundedBy?: string | null;
  refundReason?: string | null;
  stripeRefundId?: string | null;
  refundedAmountCents?: number;
  refundStatus?: "succeeded" | "pending" | "failed" | null;
}

export interface ISubscriptionRepository {
  getAll(): Promise<MockSubscription[]>;
  getByStudent(studentId: string): Promise<MockSubscription[]>;
  getById(id: string): Promise<MockSubscription | null>;
  create(data: CreateSubscriptionData): Promise<MockSubscription>;
  update(id: string, patch: SubscriptionPatch): Promise<MockSubscription | null>;
  delete(id: string): Promise<boolean>;
}
