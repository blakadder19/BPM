import * as store from "@/lib/services/staff-store";
import type {
  IStaffRepository,
  CreateStaffInviteInput,
  UpdateStaffPatch,
} from "../interfaces/staff-repository";

export const memoryStaffRepo: IStaffRepository = {
  listStaff: async () => store.listStaff(),
  getStaff: async (id) => store.getStaff(id),
  getStaffByEmail: async (email) => store.getStaffByEmail(email),
  updateStaff: async (id, patch: UpdateStaffPatch) => store.updateStaff(id, patch),
  listInvites: async () => store.listInvites(),
  getInvite: async (id) => store.getInvite(id),
  getPendingInviteByEmail: async (email) => store.getPendingInviteByEmail(email),
  createInvite: async (input: CreateStaffInviteInput) => store.createInvite(input),
  revokeInvite: async (id) => store.revokeInvite(id),
  markInviteAccepted: async (id) => store.markInviteAccepted(id),
};
