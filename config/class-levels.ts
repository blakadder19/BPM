/**
 * Class level definitions and descriptions.
 * Levels are stored as plain strings on classes; this config provides
 * display metadata and descriptions for student-facing and admin contexts.
 */

export interface ClassLevelInfo {
  name: string;
  sortOrder: number;
  description: string;
}

export const CLASS_LEVELS: ClassLevelInfo[] = [
  {
    name: "Beginner 1",
    sortOrder: 1,
    description:
      "No experience needed. Learn the fundamentals — basic steps, rhythm, and partner connection.",
  },
  {
    name: "Beginner 2",
    sortOrder: 2,
    description:
      "Build on Beginner 1 foundations with new patterns, musicality, and more complex combinations.",
  },
  {
    name: "Intermediate",
    sortOrder: 3,
    description:
      "For dancers comfortable with the basics. Develop technique, styling, and advanced partner work.",
  },
  {
    name: "Open",
    sortOrder: 4,
    description:
      "All levels welcome. Class content varies — a mix of technique, styling, and free practice.",
  },
];

const levelMap = new Map(CLASS_LEVELS.map((l) => [l.name, l]));

export function getClassLevelInfo(
  levelName: string | null
): ClassLevelInfo | undefined {
  if (!levelName) return undefined;
  return levelMap.get(levelName);
}

export function getClassLevelDescription(
  levelName: string | null
): string | null {
  return getClassLevelInfo(levelName)?.description ?? null;
}
