/**
 * Supabase-backed CreditRepository.
 *
 * Credits use the operational-persistence + hydration pattern:
 * credit operations go through the in-memory CreditService, and
 * subscription usage changes are persisted via op_subscriptions.
 *
 * This repo returns the hydrated in-memory service so that
 * DATA_PROVIDER=supabase resolves correctly.
 */

import type { ICreditRepository } from "../interfaces/credit-repository";
import type { CreditService } from "@/lib/services/credit-service";
import { getCreditService } from "@/lib/services/credit-store";

export const supabaseCreditRepo: ICreditRepository = {
  getService(): CreditService {
    return getCreditService();
  },
};
