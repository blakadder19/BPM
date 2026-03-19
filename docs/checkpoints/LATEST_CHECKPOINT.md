# BPM — Latest Checkpoint

**Date:** 2026-03-19
**Full checkpoint:** [`docs/checkpoints/bpm-checkpoint-2026-03-19-real-auth.md`](./bpm-checkpoint-2026-03-19-real-auth.md)

---

## Current State

The BPM project has transitioned from a pure in-memory prototype to a hybrid system with real Supabase auth.

### Infrastructure
- Real Supabase Auth (email/password, email confirmation)
- Brevo SMTP for transactional emails (confirmation, configured in Supabase dashboard)
- Hybrid repository layer: mock data coexists with real Supabase users
- Repository abstraction: 10 domain interfaces with memory, Supabase, and hybrid implementations
- `createAdminClient()` properly configured for server-side operations

### Auth Flow
- Signup → email confirmation via Brevo → auth callback (PKCE + implicit) → onboarding → dashboard
- `emailConfirmed` guard blocks unconfirmed users from all protected routes
- BFCache guard prevents stale page display on browser Back
- Dev tools allowlist for real authenticated emails (`DEV_TOOL_ALLOWED_EMAILS`)

### Business Layer (unchanged from prior checkpoint)
- Terms, products (12), subscriptions, bookings, waitlist, attendance, penalties
- 4 membership tiers with benefits (birthday, giveaways, free practice)
- Payment metadata (7 methods, 4 statuses)
- Code of Conduct versioned acceptance
- QR/token check-in, attendance state machine

## Latest Milestone

**Real auth integration, Brevo SMTP, onboarding/CoC flow, hybrid repository layer.**

Key additions: real Supabase email/password auth, Brevo SMTP confirmation emails, signup + email confirmation + onboarding flow, hybrid student/CoC repositories bridging mock and real data, emailConfirmed route guard, dev tools allowlist for real users, admin client server-side fix.

## What Works

- Real users can sign up, receive confirmation emails, and complete onboarding
- Real users appear in Admin Students (hybrid student repo)
- Dev tools work for real allowlisted email without impersonation
- CoC acceptance persists (Supabase or memory fallback)
- All pre-existing mock/admin flows unaffected
- TypeScript clean, build passes

## What Remains

- **Migration 00009 not applied** — `coc_acceptances` table missing on remote Supabase; CoC falls back to memory
- **Subscriptions/bookings/penalties still memory-only** — real users can't have persistent subscriptions assigned
- **DATA_PROVIDER defaults to "memory"** — intentional, but limits real Supabase persistence
- **Waitlist promotion doesn't deduct credits**
- **Birthday free class not auto-applied during booking**
- **No real payments** (Stripe/Revolut placeholder-ready)
- **No email notifications** (booking confirmations, cancellations)

## Next Recommended Step

1. **Apply migration 00009 to remote Supabase** (SQL Editor)
2. **Hybridize subscription repo** so real users can have persistent product assignments
3. **Reconcile mock types with Supabase schema** for full DB mode readiness
