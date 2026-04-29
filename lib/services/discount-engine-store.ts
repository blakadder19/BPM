/**
 * In-memory store for student affiliations + discount rules.
 *
 * Same seeding pattern as the rest of the codebase: in memory mode (default),
 * seed from STUDENT_AFFILIATIONS / DISCOUNT_RULES so the engine has data to
 * evaluate. In supabase mode, leave empty — the supabase repo is the source.
 */
import {
  STUDENT_AFFILIATIONS,
  DISCOUNT_RULES,
  type MockStudentAffiliation,
  type MockDiscountRule,
} from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import { isSupabaseMode } from "@/lib/config/data-provider";

const g = globalThis as unknown as {
  __bpm_affiliations?: MockStudentAffiliation[];
  __bpm_discount_rules?: MockDiscountRule[];
};

function initAffiliations(): MockStudentAffiliation[] {
  if (!g.__bpm_affiliations) {
    g.__bpm_affiliations = isSupabaseMode()
      ? []
      : STUDENT_AFFILIATIONS.map((a) => ({ ...a, metadata: { ...a.metadata } }));
  }
  return g.__bpm_affiliations;
}

function initDiscountRules(): MockDiscountRule[] {
  if (!g.__bpm_discount_rules) {
    g.__bpm_discount_rules = isSupabaseMode()
      ? []
      : DISCOUNT_RULES.map((r) => ({ ...r }));
  }
  return g.__bpm_discount_rules;
}

// ── Affiliations ────────────────────────────────────────────

export function getAffiliations(): MockStudentAffiliation[] {
  return initAffiliations();
}

export function getAffiliationsByStudent(
  studentId: string,
): MockStudentAffiliation[] {
  return initAffiliations().filter((a) => a.studentId === studentId);
}

export function getAffiliation(id: string): MockStudentAffiliation | undefined {
  return initAffiliations().find((a) => a.id === id);
}

export function createAffiliation(
  data: Omit<
    MockStudentAffiliation,
    "id" | "createdAt" | "updatedAt"
  > & { id?: string },
): MockStudentAffiliation {
  const list = initAffiliations();
  const now = new Date().toISOString();
  const row: MockStudentAffiliation = {
    id: data.id ?? generateId("aff"),
    studentId: data.studentId,
    affiliationType: data.affiliationType,
    verificationStatus: data.verificationStatus,
    verifiedAt: data.verifiedAt,
    verifiedBy: data.verifiedBy,
    metadata: { ...(data.metadata ?? {}) },
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    notes: data.notes,
    createdAt: now,
    updatedAt: now,
  };
  list.push(row);
  return row;
}

export function updateAffiliation(
  id: string,
  patch: Partial<Omit<MockStudentAffiliation, "id" | "studentId" | "createdAt" | "updatedAt">>,
): MockStudentAffiliation | null {
  const row = getAffiliation(id);
  if (!row) return null;
  if (patch.affiliationType !== undefined) row.affiliationType = patch.affiliationType;
  if (patch.verificationStatus !== undefined) row.verificationStatus = patch.verificationStatus;
  if (patch.verifiedAt !== undefined) row.verifiedAt = patch.verifiedAt;
  if (patch.verifiedBy !== undefined) row.verifiedBy = patch.verifiedBy;
  if (patch.metadata !== undefined) row.metadata = { ...patch.metadata };
  if (patch.validFrom !== undefined) row.validFrom = patch.validFrom;
  if (patch.validUntil !== undefined) row.validUntil = patch.validUntil;
  if (patch.notes !== undefined) row.notes = patch.notes;
  row.updatedAt = new Date().toISOString();
  return { ...row, metadata: { ...row.metadata } };
}

export function deleteAffiliation(id: string): boolean {
  const list = initAffiliations();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// ── Discount Rules ──────────────────────────────────────────

export function getDiscountRules(): MockDiscountRule[] {
  return initDiscountRules();
}

export function getActiveDiscountRules(): MockDiscountRule[] {
  return initDiscountRules().filter((r) => r.isActive);
}

export function getDiscountRule(id: string): MockDiscountRule | undefined {
  return initDiscountRules().find((r) => r.id === id);
}

export function createDiscountRule(
  data: Omit<MockDiscountRule, "id" | "createdAt" | "updatedAt"> & { id?: string },
): MockDiscountRule {
  const list = initDiscountRules();
  const now = new Date().toISOString();
  const row: MockDiscountRule = {
    id: data.id ?? generateId("dr"),
    code: data.code,
    name: data.name,
    description: data.description,
    ruleType: data.ruleType,
    affiliationType: data.affiliationType,
    discountKind: data.discountKind,
    discountValue: data.discountValue,
    appliesToProductTypes: data.appliesToProductTypes,
    appliesToProductIds: data.appliesToProductIds,
    minPriceCents: data.minPriceCents,
    maxDiscountCents: data.maxDiscountCents,
    isActive: data.isActive,
    priority: data.priority,
    stackable: data.stackable,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    createdAt: now,
    updatedAt: now,
  };
  list.push(row);
  return row;
}

export function updateDiscountRule(
  id: string,
  patch: Partial<Omit<MockDiscountRule, "id" | "createdAt" | "updatedAt">>,
): MockDiscountRule | null {
  const row = getDiscountRule(id);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return { ...row };
}

export function deleteDiscountRule(id: string): boolean {
  const list = initDiscountRules();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
