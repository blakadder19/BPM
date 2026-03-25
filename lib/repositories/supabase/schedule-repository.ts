import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type { MockClass, MockBookableClass } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type { InstanceStatus } from "@/types/domain";
import type {
  IScheduleRepository,
  CreateTemplateData,
  TemplatePatch,
  CreateInstanceData,
  InstancePatch,
} from "../interfaces/schedule-repository";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type BookableRow = Database["public"]["Tables"]["bookable_classes"]["Row"];
type StyleRow = Database["public"]["Tables"]["dance_styles"]["Row"];

function toMockClass(row: ClassRow, styleName: string | null): MockClass {
  return {
    id: row.id,
    title: row.title,
    classType: row.class_type,
    styleName,
    styleId: row.dance_style_id,
    level: row.level,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    maxCapacity: row.max_capacity,
    leaderCap: row.leader_cap,
    followerCap: row.follower_cap,
    location: row.location ?? "TBD",
    isActive: row.is_active,
    termBound: row.term_bound ?? false,
    termId: row.term_id ?? null,
  };
}

function toMockBookableClass(row: BookableRow, styleName: string | null): MockBookableClass {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    classType: row.class_type,
    styleName,
    styleId: row.dance_style_id,
    level: row.level,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status as InstanceStatus,
    maxCapacity: row.max_capacity,
    leaderCap: row.leader_cap,
    followerCap: row.follower_cap,
    bookedCount: 0,
    leaderCount: 0,
    followerCount: 0,
    waitlistCount: 0,
    location: row.location ?? "TBD",
    termBound: row.term_bound ?? false,
    termId: row.term_id ?? null,
    teacherOverride1Id: row.teacher_override_1_id ?? null,
    teacherOverride2Id: row.teacher_override_2_id ?? null,
  };
}

let styleCache: Map<string, string> | null = null;

async function getStyleNameMap(): Promise<Map<string, string>> {
  if (styleCache) return styleCache;
  const supabase = createAdminClient();
  const { data } = await supabase.from("dance_styles").select("id, name");
  styleCache = new Map((data ?? []).map((s: StyleRow) => [s.id, s.name]));
  return styleCache;
}

export const supabaseScheduleRepo: IScheduleRepository = {
  async getTemplates() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("day_of_week")
      .order("start_time");
    if (error) throw new Error(`Failed to load class templates: ${error.message}`);
    const styles = await getStyleNameMap();
    return ((data ?? []) as ClassRow[]).map((r) =>
      toMockClass(r, r.dance_style_id ? styles.get(r.dance_style_id) ?? null : null)
    );
  },

  async getTemplate(id) {
    const supabase = createAdminClient();
    const { data } = await supabase.from("classes").select("*").eq("id", id).single();
    if (!data) return null;
    const styles = await getStyleNameMap();
    const row = data as ClassRow;
    return toMockClass(row, row.dance_style_id ? styles.get(row.dance_style_id) ?? null : null);
  },

  async createTemplate(input: CreateTemplateData) {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();
    const row: Record<string, unknown> = {
      academy_id: academyId,
      dance_style_id: input.styleId,
      title: input.title,
      class_type: input.classType,
      level: input.level,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      max_capacity: input.maxCapacity,
      leader_cap: input.leaderCap,
      follower_cap: input.followerCap,
      location: input.location,
    };
    if (input.isActive !== undefined) row.is_active = input.isActive;
    if (input.termBound !== undefined) row.term_bound = input.termBound;
    if (input.termId !== undefined) row.term_id = input.termId || null;

    const { data, error } = await supabase
      .from("classes")
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMockClass(data as ClassRow, input.styleName);
  },

  async updateTemplate(id, patch: TemplatePatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.classType !== undefined) fields.class_type = patch.classType;
    if (patch.styleId !== undefined) fields.dance_style_id = patch.styleId;
    if (patch.level !== undefined) fields.level = patch.level;
    if (patch.dayOfWeek !== undefined) fields.day_of_week = patch.dayOfWeek;
    if (patch.startTime !== undefined) fields.start_time = patch.startTime;
    if (patch.endTime !== undefined) fields.end_time = patch.endTime;
    if (patch.maxCapacity !== undefined) fields.max_capacity = patch.maxCapacity;
    if (patch.leaderCap !== undefined) fields.leader_cap = patch.leaderCap;
    if (patch.followerCap !== undefined) fields.follower_cap = patch.followerCap;
    if (patch.location !== undefined) fields.location = patch.location;
    if (patch.isActive !== undefined) fields.is_active = patch.isActive;
    if (patch.termBound !== undefined) fields.term_bound = patch.termBound;
    if (patch.termId !== undefined) fields.term_id = patch.termId || null;

    if (Object.keys(fields).length === 0) return this.getTemplate(id);

    const { error } = await supabase.from("classes").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getTemplate(id);
  },

  async getInstances() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("bookable_classes")
      .select("*")
      .order("date")
      .order("start_time");
    if (error) throw new Error(`Failed to load bookable classes: ${error.message}`);
    const styles = await getStyleNameMap();
    return ((data ?? []) as BookableRow[]).map((r) =>
      toMockBookableClass(r, r.dance_style_id ? styles.get(r.dance_style_id) ?? null : null)
    );
  },

  async getInstance(id) {
    const supabase = createAdminClient();
    const { data } = await supabase.from("bookable_classes").select("*").eq("id", id).single();
    if (!data) return null;
    const styles = await getStyleNameMap();
    const row = data as BookableRow;
    return toMockBookableClass(row, row.dance_style_id ? styles.get(row.dance_style_id) ?? null : null);
  },

  async createInstance(input: CreateInstanceData) {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();
    const row: Record<string, unknown> = {
      academy_id: academyId,
      class_id: input.classId,
      dance_style_id: input.styleId,
      title: input.title,
      class_type: input.classType,
      level: input.level,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      max_capacity: input.maxCapacity,
      leader_cap: input.leaderCap,
      follower_cap: input.followerCap,
      status: input.status,
      location: input.location,
    };
    if (input.termBound !== undefined) row.term_bound = input.termBound;
    if (input.termId !== undefined) row.term_id = input.termId || null;

    const { data, error } = await supabase
      .from("bookable_classes")
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMockBookableClass(data as BookableRow, input.styleName);
  },

  async updateInstance(id, patch: InstancePatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.classType !== undefined) fields.class_type = patch.classType;
    if (patch.styleId !== undefined) fields.dance_style_id = patch.styleId;
    if (patch.level !== undefined) fields.level = patch.level;
    if (patch.date !== undefined) fields.date = patch.date;
    if (patch.startTime !== undefined) fields.start_time = patch.startTime;
    if (patch.endTime !== undefined) fields.end_time = patch.endTime;
    if (patch.maxCapacity !== undefined) fields.max_capacity = patch.maxCapacity;
    if (patch.leaderCap !== undefined) fields.leader_cap = patch.leaderCap;
    if (patch.followerCap !== undefined) fields.follower_cap = patch.followerCap;
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.location !== undefined) fields.location = patch.location;
    if (patch.termBound !== undefined) fields.term_bound = patch.termBound;
    if (patch.termId !== undefined) fields.term_id = patch.termId || null;
    if (patch.teacherOverride1Id !== undefined) fields.teacher_override_1_id = patch.teacherOverride1Id;
    if (patch.teacherOverride2Id !== undefined) fields.teacher_override_2_id = patch.teacherOverride2Id;

    if (Object.keys(fields).length === 0) return this.getInstance(id);

    const { error } = await supabase.from("bookable_classes").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getInstance(id);
  },

  async updateInstanceStatus(id, status: InstanceStatus) {
    return this.updateInstance(id, { status });
  },

  async deleteTemplate(id) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  async deleteInstance(id) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("bookable_classes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
