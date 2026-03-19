import { createAdminClient } from "@/lib/supabase/admin";
import type { CocAcceptance } from "@/lib/services/coc-store";
import type { Database } from "@/types/database";
import type { ICocRepository } from "../interfaces/coc-repository";

type CocRow = Database["public"]["Tables"]["coc_acceptances"]["Row"];

function toCocAcceptance(row: CocRow): CocAcceptance {
  return {
    studentId: row.student_id,
    acceptedVersion: row.version,
    acceptedAt: row.accepted_at,
  };
}

export const supabaseCocRepo: ICocRepository = {
  async getAcceptance(studentId) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("coc_acceptances")
      .select("*")
      .eq("student_id", studentId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`CoC getAcceptance failed: ${error.message} (code: ${error.code})`);
    }
    return data ? toCocAcceptance(data as CocRow) : null;
  },

  async hasAcceptedVersion(studentId, version) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("coc_acceptances")
      .select("id")
      .eq("student_id", studentId)
      .eq("version", version)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`CoC hasAcceptedVersion failed: ${error.message} (code: ${error.code})`);
    }
    return !!data;
  },

  async accept(studentId, version) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("coc_acceptances")
      .upsert(
        { student_id: studentId, version, accepted_at: new Date().toISOString() } as never,
        { onConflict: "student_id,version" }
      )
      .select()
      .single();
    if (error) throw new Error(`CoC accept failed: ${error.message} (code: ${error.code})`);
    return toCocAcceptance(data as CocRow);
  },

  async revoke(studentId) {
    const supabase = createAdminClient();
    const { error, count } = await supabase
      .from("coc_acceptances")
      .delete()
      .eq("student_id", studentId);
    if (error) throw new Error(`CoC revoke failed: ${error.message}`);
    return (count ?? 0) > 0;
  },
};
