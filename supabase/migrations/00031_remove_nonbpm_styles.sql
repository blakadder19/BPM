-- Remove dance styles not currently offered by BPM:
-- Reggaeton, Ladies Styling, Afro-Cuban.
-- No class templates reference these styles, so the DELETE is safe.

-- 1. Update Standard Membership products to only include Yoga & Kids Hip Hop

UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Kids Hip Hop', 'Yoga')),
  allowed_style_names = ARRAY['Kids Hip Hop', 'Yoga'],
  style_name          = 'Yoga & Kids Hip Hop',
  description         = regexp_replace(description, '\(excluding Salsa & Bachata classes\)', '(Yoga & Kids Hip Hop)')
WHERE name IN (
  'Bronze Standard Membership',
  'Silver Standard Membership',
  'Gold Standard Membership'
);

-- 2. Remove the 3 dance styles from the table

DELETE FROM dance_styles WHERE name IN ('Reggaeton', 'Ladies Styling', 'Afro-Cuban');

-- 3. Clean up teacher specialties that reference removed styles

UPDATE teacher_profiles
SET specialties = array_remove(array_remove(array_remove(specialties, 'Reggaeton'), 'Ladies Styling'), 'Afro-Cuban')
WHERE specialties && ARRAY['Reggaeton', 'Ladies Styling', 'Afro-Cuban'];
