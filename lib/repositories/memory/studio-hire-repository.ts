import type { IStudioHireRepository } from "../interfaces/studio-hire-repository";
import { getStudioHireService } from "@/lib/services/studio-hire-store";
import type { StudioHireService } from "@/lib/services/studio-hire-service";

class MemoryStudioHireRepository implements IStudioHireRepository {
  getService(): StudioHireService {
    return getStudioHireService();
  }
}

export const memoryStudioHireRepo = new MemoryStudioHireRepository();
