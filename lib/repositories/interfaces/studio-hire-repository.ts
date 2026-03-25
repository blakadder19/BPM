import type { StudioHireService } from "@/lib/services/studio-hire-service";

export interface IStudioHireRepository {
  getService(): StudioHireService;
}
