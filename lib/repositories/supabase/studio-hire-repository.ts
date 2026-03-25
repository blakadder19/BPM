/**
 * Supabase-backed StudioHireRepository.
 *
 * Studio Hire uses the operational-persistence + hydration pattern:
 * data is loaded from Supabase into the in-memory StudioHireService on
 * first access, and mutations are written through to Supabase via
 * saveStudioHireToDB / deleteStudioHireFromDB in server actions.
 *
 * This repo returns the hydrated in-memory service so that
 * DATA_PROVIDER=supabase resolves correctly.
 */

import type { IStudioHireRepository } from "../interfaces/studio-hire-repository";
import type { StudioHireService } from "@/lib/services/studio-hire-service";
import { getStudioHireService } from "@/lib/services/studio-hire-store";

export const supabaseStudioHireRepo: IStudioHireRepository = {
  getService(): StudioHireService {
    return getStudioHireService();
  },
};
