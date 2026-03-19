import { getPenaltyService } from "@/lib/services/penalty-store";
import type { IPenaltyRepository } from "../interfaces/penalty-repository";

export const memoryPenaltyRepo: IPenaltyRepository = {
  getService: () => getPenaltyService(),
};
