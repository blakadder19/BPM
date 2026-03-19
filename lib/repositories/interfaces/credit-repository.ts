/**
 * Credit repository interface.
 *
 * Wraps the CreditService. In-memory delegates to the existing class.
 */

import type { CreditService } from "@/lib/services/credit-service";

export interface ICreditRepository {
  getService(): CreditService;
}
