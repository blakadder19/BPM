/**
 * Repository interface for student affiliations (Phase 4).
 */
import type { MockStudentAffiliation } from "@/lib/mock-data";
import type {
  AffiliationType,
  AffiliationVerificationStatus,
} from "@/lib/domain/pricing-engine";

export interface CreateAffiliationData {
  studentId: string;
  affiliationType: AffiliationType;
  verificationStatus?: AffiliationVerificationStatus;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  metadata?: Record<string, unknown>;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
}

export interface AffiliationPatch {
  affiliationType?: AffiliationType;
  verificationStatus?: AffiliationVerificationStatus;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  metadata?: Record<string, unknown>;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
}

export interface IAffiliationRepository {
  getAll(): Promise<MockStudentAffiliation[]>;
  getByStudent(studentId: string): Promise<MockStudentAffiliation[]>;
  getById(id: string): Promise<MockStudentAffiliation | null>;
  create(data: CreateAffiliationData): Promise<MockStudentAffiliation>;
  update(id: string, patch: AffiliationPatch): Promise<MockStudentAffiliation | null>;
  delete(id: string): Promise<boolean>;
}
