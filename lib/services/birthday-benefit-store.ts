/**
 * Birthday benefit persistence layer.
 *
 * Uses Supabase `birthday_redemptions` table when configured,
 * falls back to in-memory for local dev / memory mode.
 */

import { createClient } from "@supabase/supabase-js";

export interface BirthdayRedemption {
  studentId: string;
  year: number;
  redeemedAt: string;
  classTitle?: string;
  classDate?: string;
}

// ── Supabase helpers ────────────────────────────────────────

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cachedClient: any = null;

function getClient() {
  if (_cachedClient) return _cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _cachedClient;
}

// ── In-memory fallback for dev/memory mode ──────────────────

const g = globalThis as unknown as {
  __bpm_birthday_redemptions?: BirthdayRedemption[];
};

function memoryStore(): BirthdayRedemption[] {
  if (!g.__bpm_birthday_redemptions) g.__bpm_birthday_redemptions = [];
  return g.__bpm_birthday_redemptions;
}

// ── Public API ──────────────────────────────────────────────

export async function isBirthdayClassUsed(
  studentId: string,
  year: number
): Promise<boolean> {
  if (hasSupabaseConfig()) {
    const client = getClient();
    if (!client) return false;
    try {
      const { data, error } = await client
        .from("birthday_redemptions")
        .select("id")
        .eq("student_id", studentId)
        .eq("year", year)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[birthday-store] check error:", error.message);
        return false;
      }
      return !!data;
    } catch (e) {
      console.warn("[birthday-store] check error:", e instanceof Error ? e.message : e);
      return false;
    }
  }
  return memoryStore().some((r) => r.studentId === studentId && r.year === year);
}

export async function markBirthdayClassUsed(
  studentId: string,
  year: number,
  classTitle?: string,
  classDate?: string
): Promise<void> {
  if (hasSupabaseConfig()) {
    const client = getClient();
    if (!client) return;
    try {
      const { error } = await client
        .from("birthday_redemptions")
        .upsert(
          {
            student_id: studentId,
            year,
            redeemed_at: new Date().toISOString(),
            class_title: classTitle ?? null,
            class_date: classDate ?? null,
          },
          { onConflict: "student_id,year" }
        );
      if (error) console.warn("[birthday-store] save error:", error.message);
    } catch (e) {
      console.warn("[birthday-store] save error:", e instanceof Error ? e.message : e);
    }
    return;
  }
  const store = memoryStore();
  if (store.some((r) => r.studentId === studentId && r.year === year)) return;
  store.push({ studentId, year, redeemedAt: new Date().toISOString(), classTitle, classDate });
}

export async function getBirthdayRedemption(
  studentId: string,
  year: number
): Promise<BirthdayRedemption | null> {
  if (hasSupabaseConfig()) {
    const client = getClient();
    if (!client) return null;
    try {
      const { data, error } = await client
        .from("birthday_redemptions")
        .select("*")
        .eq("student_id", studentId)
        .eq("year", year)
        .maybeSingle();
      if (error || !data) return null;
      return {
        studentId: data.student_id as string,
        year: data.year as number,
        redeemedAt: data.redeemed_at as string,
        classTitle: (data.class_title as string) ?? undefined,
        classDate: (data.class_date as string) ?? undefined,
      };
    } catch {
      return null;
    }
  }
  return memoryStore().find((r) => r.studentId === studentId && r.year === year) ?? null;
}

export async function unmarkBirthdayClassUsed(
  studentId: string,
  year: number
): Promise<void> {
  if (hasSupabaseConfig()) {
    const client = getClient();
    if (!client) return;
    try {
      const { error } = await client
        .from("birthday_redemptions")
        .delete()
        .eq("student_id", studentId)
        .eq("year", year);
      if (error) console.warn("[birthday-store] delete error:", error.message);
    } catch (e) {
      console.warn("[birthday-store] delete error:", e instanceof Error ? e.message : e);
    }
    return;
  }
  const store = memoryStore();
  const idx = store.findIndex((r) => r.studentId === studentId && r.year === year);
  if (idx !== -1) store.splice(idx, 1);
}

export function getBirthdayRedemptions(): BirthdayRedemption[] {
  return [...memoryStore()];
}

/**
 * Batch-load all birthday redemptions for a given year in a single query.
 * Returns a Map keyed by studentId for O(1) lookups.
 */
export async function getAllRedemptionsForYear(
  year: number
): Promise<Map<string, BirthdayRedemption>> {
  const map = new Map<string, BirthdayRedemption>();
  if (hasSupabaseConfig()) {
    const client = getClient();
    if (!client) return map;
    try {
      const { data, error } = await client
        .from("birthday_redemptions")
        .select("*")
        .eq("year", year);
      if (error || !data) return map;
      for (const row of data) {
        map.set(row.student_id as string, {
          studentId: row.student_id as string,
          year: row.year as number,
          redeemedAt: row.redeemed_at as string,
          classTitle: (row.class_title as string) ?? undefined,
          classDate: (row.class_date as string) ?? undefined,
        });
      }
    } catch {
      // best-effort
    }
    return map;
  }
  for (const r of memoryStore()) {
    if (r.year === year) map.set(r.studentId, r);
  }
  return map;
}
