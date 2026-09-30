import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runs the real handle_new_user() SQL in a throwaway local Postgres cluster
// (initdb + pg_ctl). Skipped when a cluster cannot be started (binaries
// missing, or a sandbox that forbids shared memory).

function startCluster(): { dir: string; port: number } | null {
  const hasBinaries = ["initdb", "pg_ctl", "psql"].every(
    (bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0,
  );
  if (!hasBinaries) return null;
  const dir = mkdtempSync(path.join(tmpdir(), "bpmpg-"));
  const port = 55000 + Math.floor(Math.random() * 2000);
  const data = path.join(dir, "data");
  try {
    execFileSync("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"], { stdio: "ignore" });
    execFileSync("pg_ctl", ["-D", data, "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "ignore" });
    return { dir, port };
  } catch {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
}

const cluster = startCluster();

const MIGRATIONS = path.resolve(__dirname, "../migrations");
const CANONICAL = "a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a00001";
const OTHER = "b0b0b0b0-0000-0000-0000-000000000002";

const SCHEMA = `
create type public.user_role as enum ('student', 'admin', 'teacher');
create type public.dance_role as enum ('leader', 'follower');
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create table public.academies (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null,
  created_at timestamptz not null default now()
);
create table public.users (
  id uuid primary key, academy_id uuid not null references public.academies(id), email text not null,
  full_name text not null, role public.user_role not null default 'student', phone text,
  staff_role_key text, staff_permissions jsonb, staff_status text default 'active'
);
create table public.student_profiles (id uuid primary key references public.users(id), preferred_role public.dance_role, date_of_birth text);
create table public.teacher_profiles (id uuid primary key references public.users(id));
insert into public.academies (id, name, slug, created_at) values
  ('${CANONICAL}', 'BPM', 'bpm', '2026-03-26'),
  ('${OTHER}', 'Other', 'other', '2026-09-01');
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
`;

/** Only the CREATE FUNCTION statement (00029 also alters a column). */
function functionSql(file: string): string {
  const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
  return sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user"));
}

describe.skipIf(!cluster)("handle_new_user trigger (throwaway local Postgres)", () => {
  const { dir, port } = cluster ?? { dir: "", port: 0 };
  let seq = 0;

  const psql = (sql: string) =>
    execFileSync(
      "psql",
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", sql],
      { encoding: "utf8" },
    ).trim();

  const loadFunction = (file: string) => {
    const tmp = path.join(dir, `fn-${file}`);
    writeFileSync(tmp, functionSql(file));
    execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", tmp]);
  };

  const signup = (meta: Record<string, unknown>) => {
    const literal = JSON.stringify(meta).replace(/'/g, "''");
    return psql(`insert into auth.users (email, raw_user_meta_data) values ('u${++seq}@x.test', '${literal}'::jsonb) returning id`)
      .split("\n")[0];
  };

  const userRow = (id: string) => {
    const [role, academy, staffRole, staffPerms, fullName, phone] = psql(
      `select role, academy_id, coalesce(staff_role_key,''), coalesce(staff_permissions::text,''), full_name, coalesce(phone,'') from public.users where id = '${id}'`,
    ).split("|");
    return { role, academy, staffRole, staffPerms, fullName, phone };
  };

  beforeAll(() => {
    loadFunction("00079_signup_role_hardening.sql");
    psql(SCHEMA);
  }, 60_000);

  afterAll(() => {
    spawnSync("pg_ctl", ["-D", path.join(dir, "data"), "-m", "immediate", "stop"], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("control: the current production trigger (00029) grants admin from signup metadata", () => {
    loadFunction("00029_dob_month_day_only.sql");
    try {
      expect(userRow(signup({ role: "admin" })).role).toBe("admin");
      expect(userRow(signup({ academy_id: OTHER })).academy).toBe(OTHER);
    } finally {
      loadFunction("00079_signup_role_hardening.sql");
    }
  });

  it.each(["admin", "teacher"])("00079: signup metadata role=%s → database role student", (role) => {
    const id = signup({ role, full_name: "New Person" });

    expect(userRow(id)).toMatchObject({ role: "student", fullName: "New Person" });
    expect(psql(`select count(*) from public.student_profiles where id = '${id}'`)).toBe("1");
    expect(psql(`select count(*) from public.teacher_profiles where id = '${id}'`)).toBe("0");
  });

  it("00079: academy_id cannot be selected through signup metadata", () => {
    expect(userRow(signup({ academy_id: OTHER })).academy).toBe(CANONICAL);
  });

  it("00079: a malformed academy_id no longer breaks signup", () => {
    expect(userRow(signup({ academy_id: "not-a-uuid" })).academy).toBe(CANONICAL);
  });

  it("00079: staff fields in metadata are ignored", () => {
    const row = userRow(signup({ staff_role_key: "super_admin", staff_status: "active", staff_permissions: ["*"] }));

    expect(row).toMatchObject({ role: "student", staffRole: "", staffPerms: "" });
  });

  it("00079: profile fields are still taken from signup metadata", () => {
    const id = signup({ full_name: "Ana", phone: "+353 1", preferred_role: "follower", date_of_birth: "1990-05-17" });

    expect(userRow(id)).toMatchObject({ fullName: "Ana", phone: "+353 1" });
    expect(psql(`select preferred_role || '|' || date_of_birth from public.student_profiles where id = '${id}'`)).toBe("follower|05-17");
  });
});
