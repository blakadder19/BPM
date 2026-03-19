/**
 * Penalty repository interface.
 *
 * Wraps the PenaltyService. In-memory delegates to the existing class.
 */

import type { PenaltyService } from "@/lib/services/penalty-service";

export interface IPenaltyRepository {
  getService(): PenaltyService;
}
