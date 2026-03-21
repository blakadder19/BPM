import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type { MockStudent } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type { DanceRole } from "@/types/domain";
import type { IStudentRepository, CreateStudentData, StudentPatch } from "../interfaces/student-repository";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type ProfileRow = Database["public"]["Tables"]["student_profiles"]["Row"];

function toMockStudent(user: UserRow, profile?: ProfileRow | null): MockStudent {
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
    subscriptionName: null,
    remainingCredits: null,
    joinedAt: user.created_at,
  };
}

export const supabaseStudentRepo: IStudentRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "student")
      .order("full_name");
    if (error) throw new Error(`Failed to load students: ${error.message}`);

    const typed = (users ?? []) as UserRow[];
    if (typed.length === 0) return [];

    const { data: profiles } = await supabase
      .from("student_profiles")
      .select("*")
      .in("id", typed.map((u) => u.id));

    const profileMap = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );

    return typed.map((u) => toMockStudent(u, profileMap.get(u.id)));
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("id", id)
      .single();

    return toMockStudent(user as UserRow, profile as ProfileRow | null);
  },

  async create(data: CreateStudentData) {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();

    const tempPassword = `BPM-temp-${crypto.randomUUID().slice(0, 8)}`;
    const { data: authResult, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        role: "student",
        phone: data.phone ?? undefined,
        preferred_role: data.preferredRole ?? undefined,
        date_of_birth: data.dateOfBirth ?? undefined,
      },
    });
    if (authError) throw new Error(`Auth user creation failed: ${authError.message}`);
    const userId = authResult.user.id;

    // The handle_new_user trigger already inserts into public.users and
    // student_profiles when auth.admin.createUser() fires. Use upsert to
    // enrich those rows with the full data set without duplicate-key errors.
    const { error: userError } = await supabase.from("users").upsert({
      id: userId,
      academy_id: academyId,
      email: data.email,
      full_name: data.fullName,
      role: "student",
      phone: data.phone,
    } as never, { onConflict: "id" });
    if (userError) throw new Error(`Users row upsert failed: ${userError.message}`);

    const { error: profileError } = await supabase.from("student_profiles").upsert({
      id: userId,
      preferred_role: data.preferredRole,
      notes: data.notes,
      emergency_contact_name: data.emergencyContactName,
      emergency_contact_phone: data.emergencyContactPhone,
      date_of_birth: data.dateOfBirth,
    } as never, { onConflict: "id" });
    if (profileError) throw new Error(`Student profile upsert failed: ${profileError.message}`);

    return this.getById(userId) as Promise<MockStudent>;
  },

  async update(id, patch: StudentPatch) {
    const supabase = createAdminClient();

    type UserUpdate = Database["public"]["Tables"]["users"]["Update"];
    const userFields: UserUpdate = {};
    if (patch.fullName !== undefined) userFields.full_name = patch.fullName;
    if (patch.email !== undefined) userFields.email = patch.email;
    if (patch.phone !== undefined) userFields.phone = patch.phone;

    if (Object.keys(userFields).length > 0) {
      const { error } = await supabase.from("users").update(userFields as never).eq("id", id);
      if (error) throw new Error(error.message);
    }

    const profileFields: Record<string, unknown> = { id };
    if (patch.preferredRole !== undefined) profileFields.preferred_role = patch.preferredRole;
    if (patch.notes !== undefined) profileFields.notes = patch.notes;
    if (patch.emergencyContactName !== undefined) profileFields.emergency_contact_name = patch.emergencyContactName;
    if (patch.emergencyContactPhone !== undefined) profileFields.emergency_contact_phone = patch.emergencyContactPhone;
    if (patch.dateOfBirth !== undefined) profileFields.date_of_birth = patch.dateOfBirth;

    if (Object.keys(profileFields).length > 1) {
      const { error } = await supabase
        .from("student_profiles")
        .upsert(profileFields as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    return this.getById(id);
  },

  async delete(id) {
    const supabase = createAdminClient();

    // Cascade-delete operational records (TEXT student_id, no FK constraints)
    const opTables = [
      "op_penalties",
      "op_attendance",
      "op_bookings",
      "op_waitlist",
      "op_subscriptions",
    ];
    for (const table of opTables) {
      const { error } = await supabase.from(table).delete().eq("student_id", id);
      if (error) console.warn(`[student.delete] Failed to clean ${table}:`, error.message);
    }

    // Cascade-delete normalized FK-constrained children before users row
    const fkTables = [
      "penalties",
      "attendance",
      "bookings",
      "waitlist",
      "student_subscriptions",
      "wallet_transactions",
      "payments",
    ];
    for (const table of fkTables) {
      const { error } = await supabase.from(table).delete().eq("student_id", id);
      if (error) console.warn(`[student.delete] Failed to clean ${table}:`, error.message);
    }

    const { error: profileErr } = await supabase.from("student_profiles").delete().eq("id", id);
    if (profileErr) throw new Error(`Profile delete failed: ${profileErr.message}`);

    const { error: userErr } = await supabase.from("users").delete().eq("id", id);
    if (userErr) throw new Error(`User row delete failed: ${userErr.message}`);

    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) throw new Error(`Auth user delete failed: ${authErr.message}`);

    return true;
  },

  async toggleActive(id) {
    const supabase = createAdminClient();
    const { data: current } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", id)
      .single();
    if (!current) return null;

    const { error } = await supabase
      .from("users")
      .update({ is_active: !(current as UserRow).is_active } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);

    return this.getById(id);
  },
};
