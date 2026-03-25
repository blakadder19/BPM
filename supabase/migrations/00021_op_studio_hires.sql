CREATE TABLE IF NOT EXISTS op_studio_hires (
  id              TEXT PRIMARY KEY,
  requester_name  TEXT NOT NULL,
  contact_email   TEXT,
  contact_phone   TEXT,
  date            DATE NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  expected_attendees INTEGER,
  booking_type    TEXT NOT NULL DEFAULT 'private_event',
  is_block_booking BOOLEAN NOT NULL DEFAULT FALSE,
  block_details   TEXT,
  status          TEXT NOT NULL DEFAULT 'enquiry',
  deposit_paid_cents INTEGER,
  cancellation_note TEXT,
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
