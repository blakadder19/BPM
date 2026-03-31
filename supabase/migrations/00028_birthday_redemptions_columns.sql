-- Add class detail columns to birthday_redemptions for admin visibility
ALTER TABLE birthday_redemptions
  ADD COLUMN IF NOT EXISTS class_title text,
  ADD COLUMN IF NOT EXISTS class_date text;
