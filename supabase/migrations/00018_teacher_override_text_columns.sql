-- Change teacher override columns from uuid to text.
--
-- The original migration (00016) created these as uuid FK columns referencing
-- teacher_roster(id). However, the application also stores the "__blocked__"
-- sentinel value to represent "intentionally unassigned for this date", which
-- is not a valid UUID. Changing to text allows both real teacher UUIDs and the
-- sentinel string.
--
-- Application-level cleanup on teacher delete handles orphaned references,
-- so the FK constraint is no longer needed here.

ALTER TABLE bookable_classes
  DROP CONSTRAINT IF EXISTS bookable_classes_teacher_override_1_id_fkey;

ALTER TABLE bookable_classes
  DROP CONSTRAINT IF EXISTS bookable_classes_teacher_override_2_id_fkey;

ALTER TABLE bookable_classes
  ALTER COLUMN teacher_override_1_id TYPE text USING teacher_override_1_id::text;

ALTER TABLE bookable_classes
  ALTER COLUMN teacher_override_2_id TYPE text USING teacher_override_2_id::text;
