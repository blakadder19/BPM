-- ════════════════════════════════════════════════════════════
-- 00078 — Link teacher_roster to user accounts (Phase 18)
-- ════════════════════════════════════════════════════════════
--
-- Context
-- -------
-- `teacher_roster` and the staff-access layer (`users.staff_role_key`)
-- are two DELIBERATELY separate concepts:
--
--   staff grant    → what a person can DO in the app (permissions).
--   teacher_roster → who can be ASSIGNED to teach a class slot.
--
-- They are not interchangeable, and this migration does NOT merge
-- them. The roster legitimately contains people with no BPM login at
-- all (guest instructors, visiting teachers), and being a Teacher-role
-- staff member does not automatically mean you should appear in every
-- scheduling dropdown.
--
-- What this adds is a STABLE way to link the two when an admin
-- explicitly asks for it. Before this column the only way to connect a
-- roster entry to an account was by matching `full_name`, which is
-- ambiguous and unsafe — the seeded roster contains a bare
-- "Guillermo" with no email, and two instructors can share a first
-- name.
--
-- Design notes
-- ------------
-- * Nullable, with NO backfill. Existing roster rows stay unlinked,
--   which is correct: we cannot know which account (if any) they
--   belong to, and guessing by name is exactly the failure mode this
--   column exists to prevent. Admins can link them over time.
--
-- * UNIQUE so one account cannot be linked to two roster entries,
--   which would make teacher-assignment screens ambiguous. Partial
--   (WHERE user_id IS NOT NULL) so the many unlinked rows don't
--   collide with each other on NULL.
--
-- * ON DELETE SET NULL rather than CASCADE. Deleting a user account
--   must not delete teaching history — the roster entry survives,
--   simply unlinked, so past class assignments remain intact.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════

alter table teacher_roster
  add column if not exists user_id uuid references users(id) on delete set null;

comment on column teacher_roster.user_id is
  'Optional link to the BPM account for this teacher. NULL for roster entries with no login (guest/visiting instructors) and for pre-Phase-18 rows, which were never backfilled because name matching is unsafe. Set explicitly by an admin when granting Teacher staff access with "Add to teaching roster" ticked. Staff permissions are NOT derived from this column — see users.staff_role_key.';

create unique index if not exists idx_teacher_roster_user_id_unique
  on teacher_roster(user_id)
  where user_id is not null;
