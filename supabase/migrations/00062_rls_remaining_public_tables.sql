-- 00062_rls_remaining_public_tables.sql
--
-- BPM preview QA round 2 — Supabase Security Advisor still flagged
-- "RLS Disabled in Public" for five older operational tables that
-- pre-dated the deny-by-default RLS pass:
--
--   * admin_media          (00052)
--   * op_studio_hires      (00021 / 00022)
--   * scan_receivers       (00044)
--   * scan_sessions        (00043)
--   * admin_broadcasts     (00049 / 00051)
--
-- Access audit (none of these tables are read or written from a
-- browser-side Supabase client — every reference goes through the
-- service-role key, which bypasses RLS by design):
--
--   admin_media       → lib/services/admin-media-storage.ts
--                         (createAdminClient, server only)
--   op_studio_hires   → lib/supabase/operational-persistence.ts
--                         (service-role client, server only)
--   scan_receivers    → lib/actions/scan-receiver.ts
--                         (service-role client, server actions)
--   scan_sessions     → lib/actions/paired-scan.ts
--                         (service-role client, server actions)
--   admin_broadcasts  → lib/actions/broadcasts.ts
--                         (createAdminClient, server only)
--
-- Therefore deny-by-default is the correct posture: enable RLS,
-- attach NO policies. Anonymous and user JWTs receive zero access;
-- service-role flows continue working unchanged. This mirrors
-- migration 00060 (Phase 4 / Staff & Permissions tables).
--
-- If a future feature adds direct browser-side reads from any of
-- these (e.g. a public-facing broadcast feed or a student-side hire
-- listing), that feature must add a narrow per-row policy in its
-- own migration. Do NOT loosen this file.

ALTER TABLE public.admin_media       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.op_studio_hires   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_receivers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_broadcasts  ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_media IS
  'RLS enabled (00062) — all access goes through the service-role admin client.';
COMMENT ON TABLE public.op_studio_hires IS
  'RLS enabled (00062) — all access goes through the service-role client.';
COMMENT ON TABLE public.scan_receivers IS
  'RLS enabled (00062) — all access goes through service-role server actions.';
COMMENT ON TABLE public.scan_sessions IS
  'RLS enabled (00062) — all access goes through service-role server actions.';
COMMENT ON TABLE public.admin_broadcasts IS
  'RLS enabled (00062) — all access goes through the service-role admin client.';
