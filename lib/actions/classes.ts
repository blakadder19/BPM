"use server";

import { revalidatePath } from "next/cache";
import {
  getTemplate,
  createTemplate,
  updateTemplate,
  toggleTemplateActive,
  clearAllTemplates,
} from "@/lib/services/class-store";
import {
  createInstance,
  updateInstance,
  updateInstanceStatus,
  generateFromTemplates,
  previewGeneration,
  clearAllInstances,
} from "@/lib/services/schedule-store";
import {
  createAssignment,
  updateAssignment,
  getActiveAssignmentForClass,
  toggleAssignmentActive,
  deleteAssignment,
  clearAllAssignments,
} from "@/lib/services/teacher-store";
import {
  createTeacher,
  updateTeacher,
  toggleTeacherActive,
} from "@/lib/services/teacher-roster-store";
import type { ClassType, InstanceStatus } from "@/types/domain";

const VALID_CLASS_TYPES = new Set<string>(["class", "social", "student_practice"]);
const VALID_STATUSES = new Set<string>(["scheduled", "open", "closed", "cancelled"]);

function revalidateClasses() {
  revalidatePath("/classes");
  revalidatePath("/classes/bookable");
  revalidatePath("/classes/teachers");
}

// ── Template actions ────────────────────────────────────────

export async function createTemplateAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const title = (formData.get("title") as string)?.trim();
  const classType = formData.get("classType") as string;
  const styleName = (formData.get("styleName") as string)?.trim() || null;
  const styleId = (formData.get("styleId") as string)?.trim() || null;
  const level = (formData.get("level") as string)?.trim() || null;
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  const maxCapacity = formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null;
  const leaderCap = formData.get("leaderCap") ? Number(formData.get("leaderCap")) : null;
  const followerCap = formData.get("followerCap") ? Number(formData.get("followerCap")) : null;
  const location = (formData.get("location") as string)?.trim() || "Studio A";
  const isActive = formData.get("isActive") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!title) return { success: false, error: "Title is required" };
  if (!VALID_CLASS_TYPES.has(classType)) return { success: false, error: "Invalid class type" };
  if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return { success: false, error: "Invalid day of week" };
  if (!startTime || !endTime) return { success: false, error: "Start and end time required" };
  if (endTime <= startTime) return { success: false, error: "End time must be after start time" };

  createTemplate({
    title,
    classType: classType as ClassType,
    styleName, styleId, level, dayOfWeek,
    startTime, endTime, maxCapacity, leaderCap, followerCap,
    location, isActive, notes,
  });

  revalidateClasses();
  return { success: true };
}

export async function updateTemplateAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing template ID" };

  const title = (formData.get("title") as string)?.trim();
  const classType = formData.get("classType") as string;
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();

  if (!title) return { success: false, error: "Title is required" };
  if (classType && !VALID_CLASS_TYPES.has(classType)) return { success: false, error: "Invalid class type" };
  if (startTime && endTime && endTime <= startTime) return { success: false, error: "End time must be after start time" };

  const updated = updateTemplate(id, {
    title,
    classType: classType as ClassType,
    styleName: (formData.get("styleName") as string)?.trim() || null,
    styleId: (formData.get("styleId") as string)?.trim() || null,
    level: (formData.get("level") as string)?.trim() || null,
    dayOfWeek: Number(formData.get("dayOfWeek")),
    startTime, endTime,
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null,
    leaderCap: formData.get("leaderCap") ? Number(formData.get("leaderCap")) : null,
    followerCap: formData.get("followerCap") ? Number(formData.get("followerCap")) : null,
    location: (formData.get("location") as string)?.trim() || "Studio A",
    isActive: formData.get("isActive") === "true",
    notes: (formData.get("notes") as string)?.trim() || null,
  });

  if (!updated) return { success: false, error: "Template not found" };
  revalidateClasses();
  return { success: true };
}

export async function toggleTemplateActiveAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!id) return { success: false, error: "Missing template ID" };
  const updated = toggleTemplateActive(id);
  if (!updated) return { success: false, error: "Template not found" };
  revalidateClasses();
  return { success: true };
}

// ── Schedule instance actions ───────────────────────────────

export async function createInstanceAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const templateId = (formData.get("templateId") as string)?.trim() || null;
  const title = (formData.get("title") as string)?.trim();
  const classType = formData.get("classType") as string;
  const date = (formData.get("date") as string)?.trim();
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  const status = (formData.get("status") as string) || "scheduled";

  if (!title) return { success: false, error: "Title is required" };
  if (!VALID_CLASS_TYPES.has(classType)) return { success: false, error: "Invalid class type" };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Valid date required" };
  if (!startTime || !endTime) return { success: false, error: "Times required" };
  if (!VALID_STATUSES.has(status)) return { success: false, error: "Invalid status" };

  const tpl = templateId ? getTemplate(templateId) : null;

  createInstance({
    classId: templateId,
    title,
    classType: classType as ClassType,
    styleName: (formData.get("styleName") as string)?.trim() || tpl?.styleName || null,
    styleId: (formData.get("styleId") as string)?.trim() || tpl?.styleId || null,
    level: (formData.get("level") as string)?.trim() || tpl?.level || null,
    date, startTime, endTime,
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : tpl?.maxCapacity ?? null,
    leaderCap: formData.get("leaderCap") ? Number(formData.get("leaderCap")) : tpl?.leaderCap ?? null,
    followerCap: formData.get("followerCap") ? Number(formData.get("followerCap")) : tpl?.followerCap ?? null,
    location: (formData.get("location") as string)?.trim() || tpl?.location || "Studio A",
    status: status as InstanceStatus,
    notes: (formData.get("notes") as string)?.trim() || null,
  });

  revalidateClasses();
  return { success: true };
}

export async function updateInstanceAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing instance ID" };

  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  if (startTime && endTime && endTime <= startTime) {
    return { success: false, error: "End time must be after start time" };
  }

  const patch: Record<string, unknown> = {};
  for (const f of ["title", "date", "startTime", "endTime", "location", "notes", "status"] as const) {
    const v = formData.get(f);
    if (v !== null) patch[f] = (v as string).trim() || null;
  }
  for (const f of ["maxCapacity", "leaderCap", "followerCap"] as const) {
    const v = formData.get(f);
    if (v !== null) patch[f] = v ? Number(v) : null;
  }

  const updated = updateInstance(id, patch as Parameters<typeof updateInstance>[1]);
  if (!updated) return { success: false, error: "Instance not found" };
  revalidateClasses();
  return { success: true };
}

export async function updateInstanceStatusAction(
  id: string,
  status: InstanceStatus
): Promise<{ success: boolean; error?: string }> {
  if (!id) return { success: false, error: "Missing instance ID" };
  if (!VALID_STATUSES.has(status)) return { success: false, error: "Invalid status" };
  const updated = updateInstanceStatus(id, status);
  if (!updated) return { success: false, error: "Instance not found" };
  revalidateClasses();
  return { success: true };
}

/** Set or clear teacher override on a specific schedule instance. */
export async function setInstanceTeacherOverrideAction(
  instanceId: string,
  teacher1Id: string | null,
  teacher2Id: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!instanceId) return { success: false, error: "Missing instance ID" };
  const updated = updateInstance(instanceId, {
    teacherOverride1Id: teacher1Id,
    teacherOverride2Id: teacher2Id,
  });
  if (!updated) return { success: false, error: "Instance not found" };
  revalidateClasses();
  return { success: true };
}

export async function previewGenerateScheduleAction(
  startDate: string,
  endDate: string,
  opts?: { includeInactive?: boolean; overwrite?: boolean }
): Promise<{ success: boolean; toCreate: number; toSkip: number; toOverwrite: number; error?: string }> {
  if (!startDate || !endDate) return { success: false, toCreate: 0, toSkip: 0, toOverwrite: 0, error: "Date range required" };
  if (endDate < startDate) return { success: false, toCreate: 0, toSkip: 0, toOverwrite: 0, error: "End date must be after start date" };

  const result = previewGeneration(startDate, endDate, opts);
  return { success: true, ...result };
}

export async function generateScheduleAction(
  startDate: string,
  endDate: string,
  opts?: { includeInactive?: boolean; overwrite?: boolean }
): Promise<{ success: boolean; created: number; skipped: number; overwritten?: number; error?: string }> {
  if (!startDate || !endDate) return { success: false, created: 0, skipped: 0, error: "Date range required" };
  if (endDate < startDate) return { success: false, created: 0, skipped: 0, error: "End date must be after start date" };

  const result = generateFromTemplates(startDate, endDate, opts);
  revalidateClasses();
  return { success: true, ...result };
}

// ── Teacher roster actions ──────────────────────────────────

export async function createTeacherAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const fullName = (formData.get("fullName") as string)?.trim();
  if (!fullName) return { success: false, error: "Name is required" };

  createTeacher({
    fullName,
    email: (formData.get("email") as string)?.trim() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    isActive: formData.get("isActive") !== "false",
  });

  revalidateClasses();
  return { success: true };
}

export async function updateTeacherAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing teacher ID" };

  const fullName = (formData.get("fullName") as string)?.trim();
  if (!fullName) return { success: false, error: "Name is required" };

  const updated = updateTeacher(id, {
    fullName,
    email: (formData.get("email") as string)?.trim() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    isActive: formData.get("isActive") !== "false",
  });

  if (!updated) return { success: false, error: "Teacher not found" };
  revalidateClasses();
  return { success: true };
}

export async function toggleTeacherActiveAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!id) return { success: false, error: "Missing teacher ID" };
  const updated = toggleTeacherActive(id);
  if (!updated) return { success: false, error: "Teacher not found" };
  revalidateClasses();
  return { success: true };
}

// ── Teacher assignment actions ──────────────────────────────

export async function createAssignmentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const classId = (formData.get("classId") as string)?.trim();
  const classTitle = (formData.get("classTitle") as string)?.trim();
  const teacher1Id = (formData.get("teacher1Id") as string)?.trim();
  const teacher2Id = (formData.get("teacher2Id") as string)?.trim() || null;
  const effectiveFrom = (formData.get("effectiveFrom") as string)?.trim();
  const effectiveUntil = (formData.get("effectiveUntil") as string)?.trim() || null;
  const isActive = formData.get("isActive") === "true";

  if (!classId || !classTitle) return { success: false, error: "Class is required" };
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };
  if (!effectiveFrom) return { success: false, error: "Effective from date is required" };
  if (effectiveUntil && effectiveUntil < effectiveFrom) {
    return { success: false, error: "Until date must be after from date" };
  }

  createAssignment({ classId, classTitle, teacher1Id, teacher2Id, effectiveFrom, effectiveUntil, isActive });
  revalidateClasses();
  return { success: true };
}

export async function updateAssignmentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing assignment ID" };

  const teacher1Id = (formData.get("teacher1Id") as string)?.trim();
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };

  const effectiveFrom = (formData.get("effectiveFrom") as string)?.trim();
  const effectiveUntil = (formData.get("effectiveUntil") as string)?.trim() || null;
  if (effectiveUntil && effectiveFrom && effectiveUntil < effectiveFrom) {
    return { success: false, error: "Until date must be after from date" };
  }

  const updated = updateAssignment(id, {
    teacher1Id,
    teacher2Id: (formData.get("teacher2Id") as string)?.trim() || null,
    effectiveFrom,
    effectiveUntil,
    isActive: formData.get("isActive") === "true",
  });

  if (!updated) return { success: false, error: "Assignment not found" };
  revalidateClasses();
  return { success: true };
}

export async function toggleAssignmentActiveAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!id) return { success: false, error: "Missing assignment ID" };
  const updated = toggleAssignmentActive(id);
  if (!updated) return { success: false, error: "Assignment not found" };
  revalidateClasses();
  return { success: true };
}

export async function deleteAssignmentAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!id) return { success: false, error: "Missing assignment ID" };
  const deleted = deleteAssignment(id);
  if (!deleted) return { success: false, error: "Assignment not found" };
  revalidateClasses();
  return { success: true };
}

/**
 * Create or update the active default assignment for a class.
 * If an active assignment already exists, it is updated in place.
 * Otherwise a new one is created with effectiveFrom = today.
 */
export async function saveDefaultAssignmentAction(
  classId: string,
  classTitle: string,
  teacher1Id: string,
  teacher2Id: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!classId || !classTitle) return { success: false, error: "Class info required" };
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };

  const existing = getActiveAssignmentForClass(classId);
  if (existing) {
    updateAssignment(existing.id, { teacher1Id, teacher2Id });
  } else {
    const today = new Date().toISOString().slice(0, 10);
    createAssignment({
      classId,
      classTitle,
      teacher1Id,
      teacher2Id,
      effectiveFrom: today,
      effectiveUntil: null,
      isActive: true,
    });
  }

  revalidateClasses();
  return { success: true };
}

import { BLOCKED_SENTINEL } from "@/lib/constants/teacher-assignment";

/**
 * Bulk set teacher overrides on specific instances.
 * Pass teacher IDs to assign, or null/null to remove instance-level overrides (fall back to default).
 */
export async function bulkSetTeacherOverrideAction(
  instanceIds: string[],
  teacher1Id: string | null,
  teacher2Id: string | null
): Promise<{ success: boolean; updated: number; error?: string }> {
  if (!instanceIds || instanceIds.length === 0) {
    return { success: false, updated: 0, error: "No instances selected" };
  }
  let updated = 0;
  for (const id of instanceIds) {
    const result = updateInstance(id, {
      teacherOverride1Id: teacher1Id,
      teacherOverride2Id: teacher2Id,
    });
    if (result) updated++;
  }
  revalidateClasses();
  return { success: true, updated };
}

/**
 * Bulk block instances — marks them as intentionally unassigned for their date,
 * even if a default assignment exists. Uses the BLOCKED sentinel.
 */
export async function bulkBlockInstancesAction(
  instanceIds: string[]
): Promise<{ success: boolean; updated: number; error?: string }> {
  if (!instanceIds || instanceIds.length === 0) {
    return { success: false, updated: 0, error: "No instances selected" };
  }
  let updated = 0;
  for (const id of instanceIds) {
    const result = updateInstance(id, {
      teacherOverride1Id: BLOCKED_SENTINEL,
      teacherOverride2Id: null,
    });
    if (result) updated++;
  }
  revalidateClasses();
  return { success: true, updated };
}

/**
 * Bulk update default assignments for a set of class IDs.
 * action: "assign" creates/updates defaults, "clear" deactivates them.
 */
export async function bulkDefaultAssignmentAction(
  classEntries: { classId: string; classTitle: string }[],
  action: "assign" | "clear",
  teacher1Id?: string | null,
  teacher2Id?: string | null
): Promise<{ success: boolean; updated: number; error?: string }> {
  if (!classEntries || classEntries.length === 0) {
    return { success: false, updated: 0, error: "No classes provided" };
  }

  const uniqueClasses = new Map<string, string>();
  for (const c of classEntries) {
    if (c.classId) uniqueClasses.set(c.classId, c.classTitle);
  }

  let updated = 0;

  if (action === "assign") {
    if (!teacher1Id) return { success: false, updated: 0, error: "Teacher 1 is required" };
    const today = new Date().toISOString().slice(0, 10);
    for (const [classId, classTitle] of uniqueClasses) {
      const existing = getActiveAssignmentForClass(classId);
      if (existing) {
        updateAssignment(existing.id, { teacher1Id, teacher2Id: teacher2Id ?? null });
      } else {
        createAssignment({
          classId,
          classTitle,
          teacher1Id,
          teacher2Id: teacher2Id ?? null,
          effectiveFrom: today,
          effectiveUntil: null,
          isActive: true,
        });
      }
      updated++;
    }
  } else {
    for (const [classId] of uniqueClasses) {
      const existing = getActiveAssignmentForClass(classId);
      if (existing) {
        updateAssignment(existing.id, { isActive: false });
        updated++;
      }
    }
  }

  revalidateClasses();
  return { success: true, updated };
}

// ── Dev-only actions ────────────────────────────────────────

export async function clearScheduleAction(): Promise<{
  success: boolean; cleared: number; error?: string;
}> {
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const cleared = clearAllInstances();
  revalidateClasses();
  return { success: true, cleared };
}

export async function clearTemplatesAction(): Promise<{
  success: boolean; cleared: number; error?: string;
}> {
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const cleared = clearAllTemplates();
  revalidateClasses();
  return { success: true, cleared };
}

export async function clearAssignmentsAction(): Promise<{
  success: boolean; cleared: number; error?: string;
}> {
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const cleared = clearAllAssignments();
  revalidateClasses();
  return { success: true, cleared };
}
