/**
 * Write-through persistence for schedule data to Supabase.
 * Fire-and-forget: failures are logged but don't block the memory-first flow.
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

/**
 * Persist a class template to Supabase. Only writes if the template has a UUID id
 * (meaning it came from Supabase in the first place).
 */
export async function saveTemplateToDB(tpl: MockClass): Promise<void> {
  if (!hasSupabaseConfig() || !isUUID(tpl.id)) return;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    await supabaseScheduleRepo.updateTemplate(tpl.id, {
      title: tpl.title,
      classType: tpl.classType,
      styleId: tpl.styleId,
      level: tpl.level,
      dayOfWeek: tpl.dayOfWeek,
      startTime: tpl.startTime,
      endTime: tpl.endTime,
      maxCapacity: tpl.maxCapacity,
      leaderCap: tpl.leaderCap,
      followerCap: tpl.followerCap,
      location: tpl.location,
      isActive: tpl.isActive,
    });
  } catch (err) {
    console.warn("[schedule-persistence] Failed to save template:", err instanceof Error ? err.message : err);
  }
}

/**
 * Persist a bookable class instance to Supabase. Only writes if the instance
 * has a UUID id (meaning it came from Supabase).
 */
export async function saveInstanceToDB(inst: MockBookableClass): Promise<void> {
  if (!hasSupabaseConfig() || !isUUID(inst.id)) return;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    await supabaseScheduleRepo.updateInstance(inst.id, {
      title: inst.title,
      date: inst.date,
      startTime: inst.startTime,
      endTime: inst.endTime,
      maxCapacity: inst.maxCapacity,
      leaderCap: inst.leaderCap,
      followerCap: inst.followerCap,
      status: inst.status,
      location: inst.location,
    });
  } catch (err) {
    console.warn("[schedule-persistence] Failed to save instance:", err instanceof Error ? err.message : err);
  }
}

/**
 * Update instance status in Supabase.
 */
export async function updateInstanceStatusInDB(id: string, status: InstanceStatus): Promise<void> {
  if (!hasSupabaseConfig() || !isUUID(id)) return;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    await supabaseScheduleRepo.updateInstanceStatus(id, status);
  } catch (err) {
    console.warn("[schedule-persistence] Failed to update instance status:", err instanceof Error ? err.message : err);
  }
}

/**
 * Create a new class template in Supabase.
 * Returns the created template (with UUID id) or null on failure.
 */
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
}): Promise<MockClass | null> {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    return await supabaseScheduleRepo.createTemplate(data);
  } catch (err) {
    console.warn("[schedule-persistence] Failed to create template:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Create a new bookable class instance in Supabase.
 * Returns the created instance (with UUID id) or null on failure.
 */
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
}): Promise<MockBookableClass | null> {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    return await supabaseScheduleRepo.createInstance(data);
  } catch (err) {
    console.warn("[schedule-persistence] Failed to create instance:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function deleteTemplateFromDB(id: string): Promise<boolean> {
  if (!hasSupabaseConfig() || !isUUID(id)) return false;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    return await supabaseScheduleRepo.deleteTemplate(id);
  } catch (err) {
    console.warn("[schedule-persistence] Failed to delete template:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function deleteInstanceFromDB(id: string): Promise<boolean> {
  if (!hasSupabaseConfig() || !isUUID(id)) return false;
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    return await supabaseScheduleRepo.deleteInstance(id);
  } catch (err) {
    console.warn("[schedule-persistence] Failed to delete instance:", err instanceof Error ? err.message : err);
    return false;
  }
}
