-- 00051_broadcast_rich_content.sql
--
-- Add optional rich content fields to admin_broadcasts:
-- image, CTA button, and category/tag for broadcasts.

ALTER TABLE admin_broadcasts
  ADD COLUMN IF NOT EXISTS image_url  text,
  ADD COLUMN IF NOT EXISTS cta_label  text,
  ADD COLUMN IF NOT EXISTS cta_url    text,
  ADD COLUMN IF NOT EXISTS category   text;
