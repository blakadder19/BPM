"use server";

import { revalidatePath } from "next/cache";
import { getDanceStyleRepo } from "@/lib/repositories";
import { requireAnyPermissionForAction } from "@/lib/staff-permissions";
import type { MockDanceStyle } from "@/lib/mock-data";

const MAX_NAME_LENGTH = 60;

export interface CreateDanceStyleResult {
  success: boolean;
  style?: MockDanceStyle;
  /** True when the action returned an existing style instead of creating a new one. */
  reused?: boolean;
  error?: string;
}

/**
 * Server action: create a dance style inline from the Class Template
 * editor (and any future style selector that opts in).
 *
 * Permission model:
 *   - super_admin always allowed.
 *   - classes:create OR classes:edit OR settings:edit can create styles.
 *     This covers the realistic admin journeys today (template authoring
 *     and settings) without inventing a brand-new permission family.
 *
 * Behaviour:
 *   - Trims and validates the name.
 *   - Case-insensitive dedup: returns the existing style if one already
 *     matches the normalised name. The DB also has a unique lower(name)
 *     index as a safety net.
 *   - Pushes the new row into the `globalThis.__bpm_danceStyles` cache
 *     so it is immediately visible to subsequent server reads in this
 *     process without waiting for the next bootstrap.
 *   - Revalidates the pages that consume styles (admin and student
 *     surfaces) so cached HTML reflects the change.
 */
export async function createDanceStyleAction(input: {
  name: string;
  requiresRoleBalance?: boolean;
}): Promise<CreateDanceStyleResult> {
  const guard = await requireAnyPermissionForAction([
    "classes:create",
    "classes:edit",
    "settings:edit",
  ]);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const rawName = (input.name ?? "").trim();
  if (!rawName) {
    return { success: false, error: "Style name is required" };
  }
  if (rawName.length > MAX_NAME_LENGTH) {
    return {
      success: false,
      error: `Style name must be ${MAX_NAME_LENGTH} characters or fewer`,
    };
  }

  const repo = getDanceStyleRepo();

  try {
    const existing = await repo.findByName(rawName);
    if (existing) {
      return { success: true, style: existing, reused: true };
    }

    const created = await repo.create({
      name: rawName,
      requiresRoleBalance: input.requiresRoleBalance ?? false,
    });

    // Keep the bootstrapped cache in sync. The store reads from this
    // global before falling back to the seed; if we don't update it,
    // Supabase-mode pages would keep returning the pre-create list
    // until the next process boot.
    if (typeof globalThis !== "undefined") {
      const current = globalThis.__bpm_danceStyles;
      if (Array.isArray(current)) {
        if (!current.some((s) => s.id === created.id)) current.push(created);
      } else {
        globalThis.__bpm_danceStyles = [created];
      }
    }

    revalidateStyleConsumers();
    return { success: true, style: created, reused: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // The unique-lower(name) index can race with a concurrent create.
    // If that happens, fall back to a name lookup so the caller still
    // gets a usable style instead of a hard error.
    if (/unique|duplicate/i.test(message)) {
      try {
        const fallback = await repo.findByName(rawName);
        if (fallback) {
          return { success: true, style: fallback, reused: true };
        }
      } catch {
        // ignore — fall through to the original error
      }
    }
    return { success: false, error: `Failed to create style: ${message}` };
  }
}

function revalidateStyleConsumers(): void {
  // Admin surfaces
  revalidatePath("/classes");
  revalidatePath("/classes/bookable");
  revalidatePath("/products");
  revalidatePath("/students");
  revalidatePath("/bookings");
  revalidatePath("/settings");
  // Student / public catalog surfaces
  revalidatePath("/catalog");
  revalidatePath("/dashboard");
  revalidatePath("/explore");
}
