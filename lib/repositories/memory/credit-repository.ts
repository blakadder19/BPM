import { getCreditService } from "@/lib/services/credit-store";
import type { ICreditRepository } from "../interfaces/credit-repository";

export const memoryCreditRepo: ICreditRepository = {
  getService: () => getCreditService(),
};
