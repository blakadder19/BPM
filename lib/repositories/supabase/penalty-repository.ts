import type { IPenaltyRepository } from "../interfaces/penalty-repository";

export const supabasePenaltyRepo: IPenaltyRepository = {
  getService() {
    throw new Error(
      "Supabase PenaltyRepository not yet implemented. " +
      "Set DATA_PROVIDER=memory to use the in-memory penalty service."
    );
  },
};
