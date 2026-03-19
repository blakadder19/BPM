import type { MockSubscription } from "@/lib/mock-data";
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
}

export interface ISubscriptionRepository {
  getAll(): Promise<MockSubscription[]>;
  getByStudent(studentId: string): Promise<MockSubscription[]>;
  getById(id: string): Promise<MockSubscription | null>;
  create(data: CreateSubscriptionData): Promise<MockSubscription>;
  update(id: string, patch: SubscriptionPatch): Promise<MockSubscription | null>;
}
