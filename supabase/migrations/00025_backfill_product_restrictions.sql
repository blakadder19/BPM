-- Backfill product restriction columns for all seed products.
-- Uses dance_style name lookups so this works regardless of style UUID format.

-- Helper variables via CTEs are not available in plain SQL,
-- so we use subqueries throughout.

-- ── Bachata Memberships ─────────────────────────────────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Bachata', 'Bachata Tradicional')),
  allowed_style_names = ARRAY['Bachata', 'Bachata Tradicional'],
  style_name          = 'Bachata'
WHERE name IN ('Bronze Bachata Membership', 'Silver Bachata Membership', 'Gold Bachata Membership');

-- ── Salsa Memberships ───────────────────────────────────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Cuban', 'Salsa Line')),
  allowed_style_names = ARRAY['Cuban', 'Salsa Line'],
  style_name          = 'Salsa'
WHERE name IN ('Bronze Salsa Membership', 'Silver Salsa Membership', 'Gold Salsa Membership');

-- ── Yoga Memberships ────────────────────────────────────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name = 'Yoga'),
  allowed_style_names = ARRAY['Yoga'],
  style_name          = 'Yoga'
WHERE name IN ('Bronze Yoga Membership', 'Silver Yoga Membership', 'Gold Yoga Membership');

-- ── Standard Memberships (Yoga & Kids Hip Hop) ──────────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Kids Hip Hop', 'Yoga')),
  allowed_style_names = ARRAY['Kids Hip Hop', 'Yoga'],
  style_name          = 'Yoga & Kids Hip Hop'
WHERE name IN ('Bronze Standard Membership', 'Silver Standard Membership', 'Gold Standard Membership');

-- ── Yoga Passes ─────────────────────────────────────────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name = 'Yoga'),
  allowed_style_names = ARRAY['Yoga'],
  style_name          = 'Yoga'
WHERE name IN ('Bronze Yoga Pass', 'Silver Yoga Pass', 'Gold Yoga Pass');

-- ── Latin Passes (selected style from Latin pool) ───────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Bachata', 'Bachata Tradicional', 'Cuban', 'Salsa Line')),
  allowed_style_names = ARRAY['Bachata', 'Bachata Tradicional', 'Cuban', 'Salsa Line'],
  style_name          = '1 selected style'
WHERE name IN ('Bronze Latin Pass', 'Silver Latin Pass', 'Gold Latin Pass');

-- ── Beginners 1 & 2 Promo Pass (selected style, 2 terms) ───
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Bachata', 'Bachata Tradicional', 'Cuban', 'Salsa Line')),
  allowed_style_names = ARRAY['Bachata', 'Bachata Tradicional', 'Cuban', 'Salsa Line'],
  style_name          = '1 selected style',
  span_terms          = 2
WHERE name = 'Beginners 1 & 2 Promo Pass';

-- ── Latin Combo (pick 2 of 3) ───────────────────────────────
UPDATE products SET
  allowed_style_ids   = (SELECT array_agg(id ORDER BY name) FROM dance_styles WHERE name IN ('Bachata', 'Cuban', 'Salsa Line')),
  allowed_style_names = ARRAY['Bachata', 'Cuban', 'Salsa Line'],
  style_name          = 'Pick 2 of 3 Latin'
WHERE name = 'Latin Combo (Mix and Match)';

-- ── Drop In (all styles) ────────────────────────────────────
UPDATE products SET
  style_name = 'All styles'
WHERE name = 'Drop In';

-- ── Social Pass ─────────────────────────────────────────────
UPDATE products SET
  style_name = 'Socials only'
WHERE name = 'Social Pass';

-- ── Rainbow Membership (all styles) ─────────────────────────
UPDATE products SET
  style_name = 'All styles'
WHERE name = 'Rainbow Membership';

-- ── Remove stale "Bachata Partnerwork" dance style if it exists
DELETE FROM dance_styles WHERE name = 'Bachata Partnerwork';
