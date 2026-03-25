/**
 * Schedule bootstrap — loads dance styles, class templates, and bookable class
 * instances from Supabase into the in-memory stores when Supabase is configured.
 *
 * Must be called (and awaited) before accessing the schedule stores.
 * Uses a globalThis flag to prevent re-loading within a server lifecycle.
 */

import type { MockDanceStyle, MockClass, MockBookableClass } from "@/lib/mock-data";
import { replaceTeachers } from "@/lib/services/teacher-roster-store";
import { replaceAssignments } from "@/lib/services/teacher-store";

declare global {
  // eslint-disable-next-line no-var
  var __bpm_scheduleBootstrapped: boolean | undefined;
  // eslint-disable-next-line no-var
  var __bpm_danceStyles: MockDanceStyle[] | undefined;
}

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Loads schedule data from Supabase into the in-memory stores.
 * Idempotent within a server lifecycle. No-op if Supabase is not configured.
 */
export async function ensureScheduleBootstrapped(): Promise<void> {
  if (globalThis.__bpm_scheduleBootstrapped) return;
  if (!hasSupabaseConfig()) return;

  if (!bootstrapPromise) {
    bootstrapPromise = doBootstrap();
  }
  return bootstrapPromise;
}

async function doBootstrap(): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    console.info(`[schedule-bootstrap] Connecting to Supabase at ${url?.slice(0, 40)}...`);

    const { supabaseDanceStyleRepo } = require("@/lib/repositories/supabase/dance-style-repository");
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");

    const [styles, templates, instances] = await Promise.all([
      supabaseDanceStyleRepo.getAll() as Promise<MockDanceStyle[]>,
      supabaseScheduleRepo.getTemplates() as Promise<MockClass[]>,
      supabaseScheduleRepo.getInstances() as Promise<MockBookableClass[]>,
    ]);

    globalThis.__bpm_danceStyles = styles;

    // The Supabase DB may not yet have term_bound / term_id columns.
    // Merge these fields from the in-memory seed data by matching on title
    // so the bookability engine can enforce term restrictions correctly.
    const { CLASSES: SEED_CLASSES } = require("@/lib/mock-data");
    const seedByTitle = new Map<string, MockClass>(
      (SEED_CLASSES as MockClass[]).map((c: MockClass) => [c.title, c])
    );

    for (const tmpl of templates) {
      if (tmpl.termBound === undefined) {
        const seed = seedByTitle.get(tmpl.title);
        if (seed) tmpl.termBound = seed.termBound ?? false;
      }
    }

    const tmplById = new Map(templates.map((t) => [t.id, t]));
    for (const inst of instances) {
      if (inst.termBound === undefined) {
        const tmpl = inst.classId ? tmplById.get(inst.classId) : null;
        if (tmpl) {
          inst.termBound = tmpl.termBound;
        } else {
          const seed = seedByTitle.get(inst.title);
          if (seed) inst.termBound = seed.termBound ?? false;
        }
      }
    }

    const classStore = require("./class-store");
    classStore.replaceTemplates(templates);

    const scheduleStore = require("./schedule-store");
    scheduleStore.replaceInstances(instances);

    try {
      const { supabaseTeacherRosterRepo } = require("@/lib/repositories/supabase/teacher-roster-repository");
      const { supabaseTeacherAssignmentRepo } = require("@/lib/repositories/supabase/teacher-assignment-repository");
      const dbTeachers = await supabaseTeacherRosterRepo.getAll();
      replaceTeachers(dbTeachers);
      const dbAssignments = await supabaseTeacherAssignmentRepo.getAll();
      replaceAssignments(dbAssignments);
    } catch (err) {
      console.warn("[schedule-bootstrap] Failed to load teachers from DB:", err instanceof Error ? err.message : err);
    }

    console.info(
      `[schedule-bootstrap] Loaded from Supabase: ${templates.length} templates, ${instances.length} instances`
    );

    globalThis.__bpm_scheduleBootstrapped = true;
  } catch (err) {
    console.error(
      "[schedule-bootstrap] Failed to load from Supabase, falling back to mock data:",
      err instanceof Error ? err.message : err
    );
    bootstrapPromise = null;
  }
}

/**
 * Returns the dance styles loaded from Supabase, or null if not bootstrapped.
 */
export function getBootstrappedDanceStyles(): MockDanceStyle[] | null {
  return globalThis.__bpm_danceStyles ?? null;
}

/**
 * Reset the bootstrap flag (used during HMR / store version bumps).
 */
export function resetScheduleBootstrap(): void {
  globalThis.__bpm_scheduleBootstrapped = false;
  bootstrapPromise = null;
}
