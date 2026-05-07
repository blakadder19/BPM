-- Dance styles: enforce case-insensitive uniqueness on name.
--
-- The existing UNIQUE constraint on dance_styles.name is case-sensitive,
-- which means a runtime "Bachata" and "bachata" can both be inserted by
-- the new createDanceStyleAction. Add a deterministic case-insensitive
-- index so the database itself rejects duplicates regardless of the
-- caller's normalisation. App code also normalises and dedupes — this
-- index is the safety net.
--
-- Additive only: no existing rows are modified, no columns dropped.
-- The original UNIQUE constraint on (name) is left in place.

create unique index if not exists dance_styles_name_lower_unique
  on dance_styles (lower(name));
