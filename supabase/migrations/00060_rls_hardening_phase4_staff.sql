-- 00060_rls_hardening_phase4_staff.sql
--
-- BPM preview QA blocker 1 — Supabase security warning:
--   "Table publicly accessible — Row-Level Security is not enabled
--    — rls_disabled_in_public."
--
-- Audit found that several tables introduced (or extended) by the
-- Phase 4 / Staff & Permissions / Discount Engine work were missing
-- RLS. They are all admin-managed and accessed exclusively from
-- server-side code via the service-role admin client
-- (lib/supabase/admin.ts). The deny-by-default RLS posture used by
-- migration 00032 is the correct fit:
--
--   * Service role bypasses RLS by design — server flows keep working.
--   * Anonymous and user JWTs receive zero access without an explicit
--     policy — and we deliberately do not add policies here, because
--     none of these tables are read by client-side Supabase queries.
--
-- If a future feature needs direct browser-side access to any of
-- these, that feature must add a narrow per-row policy in its own
-- migration. Do NOT loosen this file.
--
-- Tables hardened:
--   * staff_invites          (00059)  — contains invite tokens
--   * discount_claims        (00057)  — atomic first-time gate
--   * discount_rules         (00056)  — admin-managed pricing rules
--   * student_affiliations   (00056)  — verifiable PII (HSE, Gardaí)
--   * op_finance_audit_log   (00046)  — sensitive audit trail (covers
--     the metadata column extended in 00056 too)
--
-- Forward-safe: enabling RLS does not move existing rows. All current
-- application reads/writes happen through the service-role client and
-- continue unchanged.

ALTER TABLE public.staff_invites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_claims      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.op_finance_audit_log ENABLE ROW LEVEL SECURITY;

-- No FORCE RLS. Keeping the default lets the service-role bypass
-- without ceremony, mirroring the rest of the codebase. If a future
-- security review wants to FORCE RLS, it must also grant explicit
-- service_role policies to every server flow that currently writes
-- here (a non-trivial change worth its own migration).

COMMENT ON TABLE public.staff_invites IS
  'RLS enabled (00060) — all access goes through the service-role admin client.';
COMMENT ON TABLE public.discount_claims IS
  'RLS enabled (00060) — all access goes through the service-role admin client.';
COMMENT ON TABLE public.discount_rules IS
  'RLS enabled (00060) — all access goes through the service-role admin client.';
COMMENT ON TABLE public.student_affiliations IS
  'RLS enabled (00060) — all access goes through the service-role admin client.';
COMMENT ON TABLE public.op_finance_audit_log IS
  'RLS enabled (00060) — all access goes through the service-role admin client.';
