/**
 * Pure utility for detecting teacher scheduling conflicts.
 * A conflict occurs when the same teacher is assigned to overlapping classes on the same date.
 */

export interface ResolvedEntry {
  instanceId: string;
  classId: string | null;
  date: string;
  classTitle: string;
  startTime: string;
  endTime: string;
  teacher1Id: string | null;
  teacher2Id: string | null;
  teacher1Name: string | null;
  teacher2Name: string | null;
  source: "override" | "one-off" | "default" | "blocked" | "unassigned";
  defaultTeacher1Id: string | null;
  defaultTeacher2Id: string | null;
  defaultTeacher1Name: string | null;
  defaultTeacher2Name: string | null;
  hasDefaultAssignment: boolean;
  location: string;
  classType: string;
  styleName: string | null;
  status: string;
}

export interface ConflictInstance {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

export interface TeacherConflict {
  teacherId: string;
  teacherName: string;
  date: string;
  instances: ConflictInstance[];
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}

/**
 * Detect all teacher scheduling conflicts within a set of resolved entries.
 * Groups entries by (date, teacherId) and checks for pairwise time overlaps.
 */
export function detectConflicts(
  entries: ResolvedEntry[],
  teacherNameMap: Record<string, string>
): TeacherConflict[] {
  const map = new Map<string, { teacherId: string; date: string; instances: ConflictInstance[] }>();

  for (const e of entries) {
    if (e.source === "unassigned" || e.source === "blocked") continue;

    const teacherIds = [e.teacher1Id, e.teacher2Id].filter(Boolean) as string[];
    for (const tid of teacherIds) {
      const key = `${e.date}|${tid}`;
      let group = map.get(key);
      if (!group) {
        group = { teacherId: tid, date: e.date, instances: [] };
        map.set(key, group);
      }
      group.instances.push({
        id: e.instanceId,
        title: e.classTitle,
        startTime: e.startTime,
        endTime: e.endTime,
      });
    }
  }

  const conflicts: TeacherConflict[] = [];

  for (const [, group] of map) {
    if (group.instances.length < 2) continue;

    const overlapping = new Set<string>();
    for (let i = 0; i < group.instances.length; i++) {
      for (let j = i + 1; j < group.instances.length; j++) {
        const a = group.instances[i];
        const b = group.instances[j];
        if (timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
          overlapping.add(a.id);
          overlapping.add(b.id);
        }
      }
    }

    if (overlapping.size > 0) {
      conflicts.push({
        teacherId: group.teacherId,
        teacherName: teacherNameMap[group.teacherId] ?? group.teacherId,
        date: group.date,
        instances: group.instances.filter((inst) => overlapping.has(inst.id)),
      });
    }
  }

  return conflicts;
}

/** Build a set of instance IDs that are involved in any conflict. */
export function buildConflictSet(conflicts: TeacherConflict[]): Set<string> {
  const set = new Set<string>();
  for (const c of conflicts) {
    for (const inst of c.instances) {
      set.add(inst.id);
    }
  }
  return set;
}
