# BPM — Latest Checkpoint

**Date:** 2026-03-20 (Phase 2 complete)
**Full checkpoint:** [`docs/checkpoints/bpm-checkpoint-2026-03-20-operational.md`](./bpm-checkpoint-2026-03-20-operational.md)

---

## Current State

Operational persistence is complete. Real-user bookings, attendance, penalties,
and subscriptions now persist in Supabase via op_* tables and survive server
restarts. Session protection hardened with client-side auth guard.

### Critical Startup Command

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

Node.js on this machine cannot reach Supabase without the proxy env var.

### Dev Tools

Hidden by default. Unlock with **Cmd/Ctrl+Shift+D** on localhost only.

### What Works

- Full signup → confirm → onboard → dashboard flow
- Real-user bookings, cancel/restore, waitlist, attendance, penalties — all persist
- Real-user subscriptions persist across restart
- Admin dashboard uses real system date, scoped to upcoming
- Students detail panel: primary profile view (ID, email, phone, role)
- Role-required bookings auto-fill from preferredRole
- Logout clears session; back button cannot reach protected pages
- Server restart invalidates sessions (boot ID mechanism)
- Mock/demo flows unaffected
- TypeScript clean, build passes

### What Still Remains In Memory

- Schedule (classes, terms, teachers) — mock data
- Products catalog — mock data
- Wallet/payments — not started
- Email notifications — not implemented

### New Migrations Required

Run in Supabase SQL Editor if not yet applied:

1. `supabase/migrations/00010_operational_tables.sql`
2. `supabase/migrations/00011_trigger_preferred_role.sql`
3. `supabase/migrations/00012_op_subscriptions.sql`
4. `supabase/migrations/00013_trigger_phone.sql`

### DO NOT CHANGE Without Re-Test

- `handle_new_user()` trigger SQL (`SET search_path = public`)
- `lib/auth.ts` — must use `getUser()`, must stay lightweight
- `lib/supabase/hydrate-operational.ts` — hydration + orphan filter
- `lib/supabase/operational-persistence.ts` — op_* CRUD
- `middleware.ts` — boot ID + session guard + unconfirmed guard
- `components/layout/session-guard.tsx` — logout back-button protection
- Startup: `NODE_USE_ENV_PROXY=1 npm run dev`

### Next Recommended Phase

1. Apply migrations 00010–00013 to remote Supabase
2. Migrate schedule (classes, terms, teachers) to Supabase
3. Migrate products catalog to Supabase
4. Replace op_* tables with properly constrained tables
5. Custom domain + production deployment
