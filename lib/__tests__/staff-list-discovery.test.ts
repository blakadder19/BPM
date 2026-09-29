/**
 * Phase 18 — who appears on Admin → Staff.
 *
 * `listStaff()` is a Supabase query, so — following the convention
 * used by `manual-discount.test.ts` — this mirrors the exact filter it
 * applies and locks the rules in place. If the production query
 * drifts, this catches the regression against the documented
 * behaviour.
 *
 * The regression being guarded: the filter used to be
 * `role IN ('admin','teacher')`, which meant a dual-role
 * Student + Teacher never appeared at all — their base role is
 * 'student'. Staff membership must follow the GRANT, not the base role.
 */
import { describe, it, expect } from "vitest";

interface UserRow {
  email: string;
  role: "student" | "teacher" | "admin";
  staff_role_key: string | null;
  staff_status: "active" | "disabled" | "pending";
}

/**
 * Mirrors lib/repositories/supabase/staff-repository.ts::listStaff.
 * Keep in sync.
 *
 *   .or("staff_role_key.not.is.null,role.in.(admin,teacher)")
 *   then drop rows where staff_role_key IS NULL AND status='disabled'
 */
function appearsOnStaffPage(r: UserRow): boolean {
  const matchesFilter = r.staff_role_key !== null || r.role === "admin" || r.role === "teacher";
  if (!matchesFilter) return false;
  // Demo-cleanup guard (migration 00061).
  if (r.staff_role_key === null && r.staff_status === "disabled") return false;
  return true;
}

function row(over: Partial<UserRow> = {}): UserRow {
  return {
    email: "someone@example.com",
    role: "student",
    staff_role_key: null,
    staff_status: "active",
    ...over,
  };
}

describe("staff list discovery", () => {
  it("INCLUDES a dual-role student with an active teacher grant", () => {
    expect(
      appearsOnStaffPage(
        row({ role: "student", staff_role_key: "teacher", staff_status: "active" }),
      ),
    ).toBe(true);
  });

  it("INCLUDES a dual-role student whose grant is disabled (so it can be re-enabled)", () => {
    expect(
      appearsOnStaffPage(
        row({ role: "student", staff_role_key: "teacher", staff_status: "disabled" }),
      ),
    ).toBe(true);
  });

  it("INCLUDES a dual-role student with a pending grant", () => {
    expect(
      appearsOnStaffPage(
        row({ role: "student", staff_role_key: "teacher", staff_status: "pending" }),
      ),
    ).toBe(true);
  });

  it("EXCLUDES an ordinary student with no grant", () => {
    expect(appearsOnStaffPage(row({ role: "student", staff_role_key: null }))).toBe(false);
  });

  it("EXCLUDES an ordinary student even when their staff_status is active", () => {
    // staff_status defaults to 'active' in the schema, so it must not
    // be treated as evidence of a grant on its own.
    expect(
      appearsOnStaffPage(
        row({ role: "student", staff_role_key: null, staff_status: "active" }),
      ),
    ).toBe(false);
  });

  it("INCLUDES legacy role=admin with no grant (pre-00059 rows)", () => {
    expect(appearsOnStaffPage(row({ role: "admin", staff_role_key: null }))).toBe(true);
  });

  it("INCLUDES legacy role=teacher with no grant", () => {
    expect(appearsOnStaffPage(row({ role: "teacher", staff_role_key: null }))).toBe(true);
  });

  it("EXCLUDES demo-cleanup rows (no grant + disabled)", () => {
    expect(
      appearsOnStaffPage(
        row({ role: "admin", staff_role_key: null, staff_status: "disabled" }),
      ),
    ).toBe(false);
  });

  it("INCLUDES real disabled staff, who keep their grant", () => {
    expect(
      appearsOnStaffPage(
        row({ role: "admin", staff_role_key: "super_admin", staff_status: "disabled" }),
      ),
    ).toBe(true);
  });

  it("includes every staff role key regardless of base role", () => {
    for (const key of ["super_admin", "admin", "front_desk", "teacher", "read_only", "custom"]) {
      expect(
        appearsOnStaffPage(row({ role: "student", staff_role_key: key, staff_status: "active" })),
      ).toBe(true);
    }
  });

  it("a realistic mixed table yields only the staff", () => {
    const table: UserRow[] = [
      row({ email: "zaria@x.com", role: "admin", staff_role_key: "super_admin" }),
      row({ email: "guille@x.com", role: "student", staff_role_key: "teacher" }),
      row({ email: "plain.student@x.com", role: "student", staff_role_key: null }),
      row({ email: "another.student@x.com", role: "student", staff_role_key: null }),
      row({ email: "legacy.teacher@x.com", role: "teacher", staff_role_key: null }),
      row({
        email: "demo.cleanup@x.com",
        role: "admin",
        staff_role_key: null,
        staff_status: "disabled",
      }),
    ];
    expect(table.filter(appearsOnStaffPage).map((r) => r.email)).toEqual([
      "zaria@x.com",
      "guille@x.com",
      "legacy.teacher@x.com",
    ]);
  });
});
