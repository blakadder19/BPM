import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * RBAC audit — fails the test suite when admin server actions or admin
 * pages still contain legacy broad gates that the deny-by-default
 * lockdown is meant to eliminate.
 *
 * Scope:
 *   - lib/actions/**  must NOT contain `requireRole(["admin"]` or
 *     `requireRole(["admin","teacher"]` (the legacy users.role bypass).
 *   - lib/actions/** and app/(app)/** must NOT contain
 *     `user.role === "admin"` / `role !== "admin"` style checks.
 *
 * Allowed exceptions are listed in `ALLOWED_FILES` with a justification
 * comment. Adding a file here requires reviewer attention.
 */

const ROOT = join(__dirname, "..", "..");

// Files that still legitimately reference users.role admin/teacher for
// reasons unrelated to authorization. Each must keep server-side enforcement
// elsewhere via requirePermission* / requireSuperAdmin*.
const ALLOWED_FILES: Record<string, string> = {
  // The Auth helper itself implements requireRole — must be allowed to
  // mention the role names it accepts.
  "lib/auth.ts": "requireRole helper definition",
  // Topbar: client-side display label only (e.g. role badge text). Permission
  // gating for buttons is via canScan prop from the layout.
  "components/layout/topbar.tsx": "role badge label only",
  // App layout: uses role==='student' branch + reads staffAccess. The remaining
  // role checks are for student vs non-student switching, not authorization.
  "app/(app)/layout.tsx": "student/non-student branching only",
  // Classes layout: visual hint only (hides admin tabs from students),
  // server-side access is per-page.
  "app/(app)/classes/layout.tsx": "visual hint only",
  // staff-permissions.ts: implements the legacy fallback intentionally
  // checks user.role for users WITHOUT a staff_role_key.
  "lib/staff-permissions.ts": "documented legacy fallback",
};

const STUDENT_OK_PATTERN = /requireRole\(\["student"\]/;

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith("."))
      continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) listFiles(full, out);
    else if (
      entry.endsWith(".ts") ||
      entry.endsWith(".tsx")
    )
      out.push(full);
  }
  return out;
}

function relPath(p: string): string {
  return p.replace(`${ROOT}/`, "");
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/**
 * Strip line/block comments from source so audit patterns don't false-positive
 * on documentation that mentions legacy gates by name.
 */
function stripComments(src: string): string {
  // Remove block comments first.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments.
  out = out
    .split("\n")
    .map((l) => {
      const idx = l.indexOf("//");
      if (idx === -1) return l;
      // Keep "://" inside string-ish contexts (URL paths). The lines we audit
      // are short enough that the heuristic below holds: only treat "//" as a
      // comment when not preceded by a colon-then-letter chain (URL marker)
      // and not inside a string literal we can detect with quote-balance.
      const before = l.slice(0, idx);
      const dq = (before.match(/"/g) ?? []).length;
      const sq = (before.match(/'/g) ?? []).length;
      const bq = (before.match(/`/g) ?? []).length;
      // If we're inside an unbalanced string literal, treat // as data.
      if (dq % 2 === 1 || sq % 2 === 1 || bq % 2 === 1) return l;
      return before;
    })
    .join("\n");
  return out;
}

describe("RBAC audit (deny-by-default lockdown)", () => {
  it("no server action under lib/actions uses requireRole(['admin']) or requireRole(['admin','teacher'])", () => {
    const dir = join(ROOT, "lib", "actions");
    const offenders: string[] = [];
    for (const file of listFiles(dir)) {
      const src = stripComments(read(file));
      const lines = src.split("\n");
      lines.forEach((line, idx) => {
        // Strip the "student" allowance — those are not admin gates.
        if (STUDENT_OK_PATTERN.test(line)) return;
        if (
          line.includes('requireRole(["admin"]') ||
          line.includes('requireRole(["admin","teacher"]') ||
          line.includes('requireRole(["admin", "teacher"]')
        ) {
          offenders.push(`${relPath(file)}:${idx + 1} → ${line.trim()}`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error(
        `Legacy requireRole(['admin']) gates remain in server actions. ` +
          `Replace each with requirePermission*/requireSuperAdmin* per the ` +
          `RBAC lockdown:\n  - ${offenders.join("\n  - ")}`,
      );
    }
  });

  it("no admin page under app/(app) uses requireRole(['admin']) or requireRole(['admin','teacher'])", () => {
    const dir = join(ROOT, "app", "(app)");
    const offenders: string[] = [];
    for (const file of listFiles(dir)) {
      if (!file.endsWith("/page.tsx")) continue;
      const src = stripComments(read(file));
      const lines = src.split("\n");
      lines.forEach((line, idx) => {
        if (STUDENT_OK_PATTERN.test(line)) return;
        if (
          line.includes('requireRole(["admin"]') ||
          line.includes('requireRole(["admin","teacher"]') ||
          line.includes('requireRole(["admin", "teacher"]')
        ) {
          offenders.push(`${relPath(file)}:${idx + 1} → ${line.trim()}`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error(
        `Legacy requireRole(['admin']) gates remain in admin pages:\n  - ${offenders.join(
          "\n  - ",
        )}`,
      );
    }
  });

  it("no server action under lib/actions uses raw user.role === 'admin' / role !== 'admin' checks", () => {
    const dir = join(ROOT, "lib", "actions");
    const offenders: string[] = [];
    const re = /(?:user\.role|user\?\.role)\s*[!=]==\s*"(admin|teacher)"/;
    for (const file of listFiles(dir)) {
      const src = stripComments(read(file));
      const lines = src.split("\n");
      lines.forEach((line, idx) => {
        if (re.test(line)) {
          offenders.push(`${relPath(file)}:${idx + 1} → ${line.trim()}`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error(
        `Server actions still contain legacy users.role admin/teacher checks. ` +
          `Replace with permission-aware guards (requirePermissionForAction, ` +
          `getStaffAccess + hasPermission, etc.):\n  - ${offenders.join(
            "\n  - ",
          )}`,
      );
    }
  });

  it("only ALLOWED_FILES outside lib/actions reference legacy user.role admin/teacher equality", () => {
    const offenders: string[] = [];
    const re = /(?:user\.role|user\?\.role)\s*[!=]==\s*"(admin|teacher)"/;
    const dirs = [
      join(ROOT, "app"),
      join(ROOT, "components"),
      join(ROOT, "lib"),
    ];
    for (const dir of dirs) {
      for (const file of listFiles(dir)) {
        const rel = relPath(file);
        if (rel.startsWith("lib/actions/")) continue; // covered by previous test
        if (rel.includes("__tests__/")) continue;
        if (rel in ALLOWED_FILES) continue;
        const src = stripComments(read(file));
        if (re.test(src)) {
          offenders.push(rel);
        }
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `Files contain legacy users.role admin/teacher equality checks not on the ` +
          `RBAC audit allow-list. Either gate by permissions (e.g. ` +
          `getStaffAccess + hasPermission) or add the file to ALLOWED_FILES ` +
          `with a clear justification:\n  - ${offenders.join("\n  - ")}`,
      );
    }
  });
});
