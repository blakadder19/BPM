# BPM — Latest Checkpoint

**Date:** 2026-03-20
**Full checkpoint:** [`docs/checkpoints/bpm-checkpoint-2026-03-20-stability.md`](./bpm-checkpoint-2026-03-20-stability.md)

---

## Current State

First fully working real-auth configuration. Signup, email confirmation,
onboarding, and Admin Students all work end-to-end with real Supabase users.

### Critical Startup Command

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

Node.js on this machine cannot reach Supabase without the proxy env var.

### What Works

- Fresh email signup → Brevo confirmation → auth callback → onboarding → dashboard
- `handle_new_user()` trigger creates `public.users` + `student_profiles` on signup
- Real users appear in Admin > Students (hybrid student repo)
- Product/subscription assignment (memory store, works for both mock and real users)
- Dev tools for allowlisted real email without impersonation
- All mock/demo flows unaffected
- TypeScript clean, build passes

### What Remains

- Products/terms not seeded in Supabase (subscriptions stored in memory only)
- Bookings, attendance, penalties still memory-only
- Wallet transactions from mock data only
- No real payments (Stripe placeholder-ready)
- No email notifications for bookings

### DO NOT CHANGE Without Re-Test

- `handle_new_user()` trigger SQL (`SET search_path = public` is critical)
- `lib/auth.ts` — auth resolution must stay lightweight, no provisioning
- `lib/auth-provisioning.ts` + `lib/actions/auth-provision.ts` — callback-only provisioning
- `lib/repositories/index.ts` — hybrid repo routing
- `lib/supabase/admin.ts` — admin client config
- Startup: `NODE_USE_ENV_PROXY=1 npm run dev`

### Next Recommended Steps

1. Seed products/terms into Supabase so subscriptions can persist
2. Reconcile mock types with Supabase schema for full DB mode
3. Custom domain / confirmation link configuration for production
