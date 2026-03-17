import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { DanceRole, StudentListItem } from "@/types/domain";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type ProfileRow = Database["public"]["Tables"]["student_profiles"]["Row"];

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
    subscriptionName: null, // PROVISIONAL — wire when subscriptions are connected
    remainingCredits: null, // PROVISIONAL — wire when subscriptions are connected
    joinedAt: user.created_at,
  };
}

export async function getStudents(): Promise<StudentListItem[]> {
  const supabase = createAdminClient();

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("*")
    .eq("role", "student")
    .eq("is_active", true)
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

export async function updateStudent(
  id: string,
  patch: {
    fullName: string;
    email: string;
    phone: string | null;
    preferredRole: DanceRole | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error: userErr } = await supabase
    .from("users")
    .update({
      full_name: patch.fullName,
      email: patch.email,
      phone: patch.phone,
    })
    .eq("id", id);

  if (userErr) return { success: false, error: userErr.message };

  const { error: profileErr } = await supabase
    .from("student_profiles")
    .upsert(
      { id, preferred_role: patch.preferredRole },
      { onConflict: "id" }
    );

  if (profileErr) return { success: false, error: profileErr.message };

  return { success: true };
}