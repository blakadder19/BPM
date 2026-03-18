import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStudents as mockGetStudents,
  createStudent as mockCreateStudent,
  updateStudent as mockUpdateStudent,
  toggleStudentActive as mockToggleActive,
} from "@/lib/services/student-store";
import type { Database } from "@/types/database";
import type { DanceRole, StudentListItem } from "@/types/domain";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type ProfileRow = Database["public"]["Tables"]["student_profiles"]["Row"];

const isDev = process.env.NODE_ENV === "development";

function toListItem(
  user: UserRow,
  profile: ProfileRow | undefined
): StudentListItem {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    preferredRole: (profile?.preferred_role as DanceRole | null) ?? null,
    isActive: user.is_active,
    notes: profile?.notes ?? null,
    emergencyContactName: profile?.emergency_contact_name ?? null,
    emergencyContactPhone: profile?.emergency_contact_phone ?? null,
    dateOfBirth: profile?.date_of_birth ?? null,
    subscriptionName: null, // PROVISIONAL — derived in UI from subscriptions array
    remainingCredits: null, // PROVISIONAL — derived in UI from subscriptions array
    joinedAt: user.created_at,
  };
}

export async function getStudents(): Promise<StudentListItem[]> {
  if (isDev) return mockGetStudents();

  const supabase = createAdminClient();

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("*")
    .eq("role", "student")
    .order("full_name");

  if (usersErr) throw new Error(`Failed to load students: ${usersErr.message}`);

  const typedUsers = (users ?? []) as UserRow[];
  if (typedUsers.length === 0) return [];

  const ids = typedUsers.map((u) => u.id);

  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("*")
    .in("id", ids);

  const typedProfiles = (profiles ?? []) as ProfileRow[];

  const profileMap = new Map<string, ProfileRow>(
    typedProfiles.map((p) => [p.id, p])
  );

  return typedUsers.map((u) => toListItem(u, profileMap.get(u.id)));
}

export async function createStudent(data: {
  fullName: string;
  email: string;
  phone: string | null;
  preferredRole: DanceRole | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
}): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    mockCreateStudent(data);
    return { success: true };
  }

  // PROVISIONAL: production create requires Supabase Auth admin.createUser
  // plus inserting into users + student_profiles. Not yet implemented.
  return { success: false, error: "Production student creation not yet implemented" };
}

export async function updateStudent(
  id: string,
  patch: {
    fullName?: string;
    email?: string;
    phone?: string | null;
    preferredRole?: DanceRole | null;
    isActive?: boolean;
    notes?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    dateOfBirth?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    const result = mockUpdateStudent(id, patch);
    return result
      ? { success: true }
      : { success: false, error: "Student not found" };
  }

  const supabase = createAdminClient();

  type UserUpdate = Database["public"]["Tables"]["users"]["Update"];
  const userFields: UserUpdate = {};
  if (patch.fullName !== undefined) userFields.full_name = patch.fullName;
  if (patch.email !== undefined) userFields.email = patch.email;
  if (patch.phone !== undefined) userFields.phone = patch.phone;
  if (patch.isActive !== undefined) userFields.is_active = patch.isActive;

  if (Object.keys(userFields).length > 0) {
    const { error: userErr } = await supabase
      .from("users")
      .update(userFields)
      .eq("id", id);
    if (userErr) return { success: false, error: userErr.message };
  }

  type ProfileInsert = Database["public"]["Tables"]["student_profiles"]["Insert"];
  const profileFields: ProfileInsert = { id };
  if (patch.preferredRole !== undefined) profileFields.preferred_role = patch.preferredRole;
  if (patch.notes !== undefined) profileFields.notes = patch.notes;
  if (patch.emergencyContactName !== undefined) profileFields.emergency_contact_name = patch.emergencyContactName;
  if (patch.emergencyContactPhone !== undefined) profileFields.emergency_contact_phone = patch.emergencyContactPhone;
  if (patch.dateOfBirth !== undefined) profileFields.date_of_birth = patch.dateOfBirth;

  const hasProfileChanges = Object.keys(profileFields).length > 1;
  if (hasProfileChanges) {
    const { error: profileErr } = await supabase
      .from("student_profiles")
      .upsert(profileFields, { onConflict: "id" });
    if (profileErr) return { success: false, error: profileErr.message };
  }

  return { success: true };
}

export async function toggleStudentActive(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    const result = mockToggleActive(id);
    return result
      ? { success: true }
      : { success: false, error: "Student not found" };
  }

  // PROVISIONAL: production toggle — fetch current is_active then flip
  return { success: false, error: "Production toggle not yet implemented" };
}
