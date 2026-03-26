/**
 * Supabase-backed PenaltyRepository.
 *
 * Penalties use the operational-persistence + hydration pattern:
 * data is loaded from op_penalties into the in-memory PenaltyService
 * on first access, and mutations are written through to Supabase via
 * savePenaltyToDB / deletePenaltyFromDB in server actions.
 *
 * This repo returns the hydrated in-memory service so that
 * DATA_PROVIDER=supabase resolves correctly.
 */

import type { IPenaltyRepository } from "../interfaces/penalty-repository";
import type { PenaltyService } from "@/lib/services/penalty-service";
import { getPenaltyService } from "@/lib/services/penalty-store";

export const supabasePenaltyRepo: IPenaltyRepository = {
  getService(): PenaltyService {
    return getPenaltyService();
  },
};
