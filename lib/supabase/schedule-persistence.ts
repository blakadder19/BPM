/**
 * Write-through persistence for schedule data to Supabase.
 *
 * DB-first contract: all functions THROW on failure.
 * The calling action must catch errors and decide whether to
 * propagate or fall back to memory-only mode.
 *
 * When Supabase is not configured, functions are no-ops (return
 * gracefully) so memory-only local dev still works.
 */

import type { MockClass, MockBookableClass } from "@/lib/mock-data";
import type { InstanceStatus } from "@/types/domain";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ── Template persistence ────────────────────────────────────

export async function createTemplateToDB(data: {
  title: string;
  classType: "class" | "social" | "student_practice";
  styleId: string | null;
  styleName: string | null;
  level: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
  isActive?: boolean;
  termBound?: boolean;
  termId?: string | null;
  [key: string]: unknown;
}): Promise<MockClass | null> {
  if (!hasSupabaseConfig()) return null;
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  const { notes: _notes, ...safeData } = data;
  return await supabaseScheduleRepo.createTemplate(safeData);
}

export async function saveTemplateToDB(id: string, patch: Record<string, unknown>): Promise<void> {
  if (!hasSupabaseConfig()) return;
  if (!isUUID(id)) {
    throw new Error(`Cannot persist template with non-UUID id "${id}". Initial DB create likely failed.`);
  }
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  await supabaseScheduleRepo.updateTemplate(id, patch);
}

export async function deleteTemplateFromDB(id: string): Promise<void> {
  if (!hasSupabaseConfig()) return;
  if (!isUUID(id)) {
    throw new Error(`Cannot delete template with non-UUID id "${id}".`);
  }
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  await supabaseScheduleRepo.deleteTemplate(id);
}

// ── Instance persistence ────────────────────────────────────

export async function createInstanceInDB(data: {
  classId: string | null;
  title: string;
  classType: "class" | "social" | "student_practice";
  styleId: string | null;
  styleName: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  status: InstanceStatus;
  location: string;
  termBound?: boolean;
  termId?: string | null;
}): Promise<MockBookableClass | null> {
  if (!hasSupabaseConfig()) return null;
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  return await supabaseScheduleRepo.createInstance(data);
}

export async function saveInstanceToDB(id: string, patch: Record<string, unknown>): Promise<void> {
  if (!hasSupabaseConfig()) return;
  if (!isUUID(id)) {
    throw new Error(`Cannot persist instance with non-UUID id "${id}". Initial DB create likely failed.`);
  }
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  await supabaseScheduleRepo.updateInstance(id, patch);
}

export async function updateInstanceStatusInDB(id: string, status: InstanceStatus): Promise<void> {
  if (!hasSupabaseConfig()) return;
  if (!isUUID(id)) {
    throw new Error(`Cannot update status for instance with non-UUID id "${id}".`);
  }
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  await supabaseScheduleRepo.updateInstanceStatus(id, status);
}

export async function deleteInstanceFromDB(id: string): Promise<void> {
  if (!hasSupabaseConfig()) return;
  if (!isUUID(id)) {
    throw new Error(`Cannot delete instance with non-UUID id "${id}".`);
  }
  const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
  await supabaseScheduleRepo.deleteInstance(id);
}
