-- ============================================================
-- BPM Booking System · Migration 00009
-- Schema alignment with in-memory model.
--
-- Adds missing enums, tables (terms, coc_acceptances,
-- birthday_redemptions), and columns needed to match the
-- full business-layer model.
-- ============================================================

-- ── Enum alignment ────────────────────────────────────────────

-- booking_status: add checked_in, late_cancelled, missed
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'late_cancelled';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'missed';

-- product_type: add "pass" (domain uses pass instead of pack)
ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'pass';


-- ── Terms table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES academies(id),
  name        text        NOT NULL,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  status      text        NOT NULL DEFAULT 'draft',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_terms_dates CHECK (end_date > start_date)
);

ALTER TABLE terms ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_terms_updated_at
  BEFORE UPDATE ON terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── Code of Conduct acceptances ───────────────────────────────

CREATE TABLE IF NOT EXISTS coc_acceptances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     text        NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, version)
);

ALTER TABLE coc_acceptances ENABLE ROW LEVEL SECURITY;


-- ── Birthday redemptions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS birthday_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year        int         NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, year)
);

ALTER TABLE birthday_redemptions ENABLE ROW LEVEL SECURITY;


-- ── Extend products table ─────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS long_description     text,
  ADD COLUMN IF NOT EXISTS term_bound           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classes_per_term     int,
  ADD COLUMN IF NOT EXISTS auto_renew           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS benefits             text[],
  ADD COLUMN IF NOT EXISTS credits_model        text,
  ADD COLUMN IF NOT EXISTS validity_description text,
  ADD COLUMN IF NOT EXISTS is_provisional       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes                text;


-- ── Extend student_subscriptions table ────────────────────────

ALTER TABLE student_subscriptions
  ADD COLUMN IF NOT EXISTS payment_method       text,
  ADD COLUMN IF NOT EXISTS payment_status       text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS assigned_by          uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at          timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS term_id              uuid REFERENCES terms(id),
  ADD COLUMN IF NOT EXISTS classes_used         int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classes_per_term     int,
  ADD COLUMN IF NOT EXISTS auto_renew           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_style_names text[],
  ADD COLUMN IF NOT EXISTS notes                text;


-- ── Extend bookings table ─────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS check_in_method text,
  ADD COLUMN IF NOT EXISTS check_in_token  text,
  ADD COLUMN IF NOT EXISTS source          text,
  ADD COLUMN IF NOT EXISTS admin_note      text;


-- ── RLS policies for new tables ───────────────────────────────

-- Terms: all authenticated users can view, admins manage
CREATE POLICY "Authenticated users can view terms"
  ON terms FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage terms"
  ON terms FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- CoC acceptances: students see own, admins see all
CREATE POLICY "Students view own CoC acceptance"
  ON coc_acceptances FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can insert own CoC acceptance"
  ON coc_acceptances FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage CoC acceptances"
  ON coc_acceptances FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Birthday redemptions: students see own, admins see all
CREATE POLICY "Students view own birthday redemptions"
  ON birthday_redemptions FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins manage birthday redemptions"
  ON birthday_redemptions FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- ── Indexes for new tables ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_terms_academy     ON terms(academy_id);
CREATE INDEX IF NOT EXISTS idx_terms_status      ON terms(status);
CREATE INDEX IF NOT EXISTS idx_coc_student       ON coc_acceptances(student_id);
CREATE INDEX IF NOT EXISTS idx_birthday_student  ON birthday_redemptions(student_id);
