import type { ICreditRepository } from "../interfaces/credit-repository";

export const supabaseCreditRepo: ICreditRepository = {
  getService() {
    throw new Error(
      "Supabase CreditRepository not yet implemented. " +
      "Set DATA_PROVIDER=memory to use the in-memory credit service."
    );
  },
};
