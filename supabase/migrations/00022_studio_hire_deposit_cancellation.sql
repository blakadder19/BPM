ALTER TABLE op_studio_hires ADD COLUMN IF NOT EXISTS deposit_required_cents INTEGER;
ALTER TABLE op_studio_hires ADD COLUMN IF NOT EXISTS cancellation_outcome TEXT;
ALTER TABLE op_studio_hires ADD COLUMN IF NOT EXISTS refunded_cents INTEGER;
ALTER TABLE op_studio_hires ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
