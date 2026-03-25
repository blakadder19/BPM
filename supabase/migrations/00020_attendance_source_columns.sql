ALTER TABLE op_attendance ADD COLUMN IF NOT EXISTS source text DEFAULT 'walk_in';
ALTER TABLE op_attendance ADD COLUMN IF NOT EXISTS subscription_id text;
