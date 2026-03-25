-- Add term_bound and term_id columns to class templates and schedule instances.
-- These support the term-bound course logic: if a class is linked to a term,
-- its date must fall within that term's range, and students cannot self-book
-- once the term has started.

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS term_bound boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS term_id   uuid REFERENCES terms(id);

ALTER TABLE bookable_classes
  ADD COLUMN IF NOT EXISTS term_bound boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS term_id   uuid REFERENCES terms(id);
