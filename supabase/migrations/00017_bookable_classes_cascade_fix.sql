-- Fix bookable_classes.class_id FK to use ON DELETE SET NULL.
-- The original migration (00003) created this FK without a cascade policy,
-- defaulting to NO ACTION (RESTRICT). This prevents deleting a class template
-- when schedule instances still reference it.
-- ON DELETE SET NULL is correct: deleting a template unlinks the instance
-- (becomes ad-hoc) rather than cascade-deleting bookable records.

ALTER TABLE bookable_classes
  DROP CONSTRAINT IF EXISTS bookable_classes_class_id_fkey,
  ADD CONSTRAINT bookable_classes_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
