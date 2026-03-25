-- Add teacher override columns to bookable_classes.
-- These allow per-instance teacher assignment that overrides the default
-- assignment from teacher_default_assignments.
-- NULL = use default assignment. A value = override for this specific instance.

ALTER TABLE bookable_classes
  ADD COLUMN IF NOT EXISTS teacher_override_1_id uuid REFERENCES teacher_roster(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_override_2_id uuid REFERENCES teacher_roster(id) ON DELETE SET NULL;
