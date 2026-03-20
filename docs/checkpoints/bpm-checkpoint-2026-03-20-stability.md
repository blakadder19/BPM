# BPM Stability Checkpoint — 2026-03-20

## 1. Purpose

This checkpoint locks in the first fully working real-auth configuration.
Everything described here has been verified end-to-end. Do not casually
refactor auth, trigger logic, repository wiring, or startup configuration
without re-testing the full signup→confirm→onboard→dashboard flow.

---

## 2. What Is Working

| Area | Status | Notes |
|------|--------|-------|
| Fresh email signup | Working | Supabase Auth creates user, trigger creates profile rows |
| Email confirmation (Brevo SMTP) | Working | Confirmation link → auth callback → onboarding |
| Onboarding / CoC acceptance | Working | Persists via hybrid CoC repo (Supabase → memory fallback) |
| Real user in Admin > Students | Working | Hybrid student repo merges mock + real Supabase students |
| Dev tools for real user | Working | Allowlisted email sees full dev panel without impersonation |
| Product/subscription assignment | Working | Writes to memory store (products not yet seeded in Supabase) |
| Mock/demo student flows | Working | Unaffected by real auth changes |
| TypeScript / build | Clean | `tsc --noEmit` and `next build` both pass |

---

## 3. Critical Startup Command

On this work laptop, Node.js cannot reach Supabase without the system
proxy. The app **must** be started with:

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

Without `NODE_USE_ENV_PROXY=1`:
- `curl` to Supabase works (uses system proxy)
- Plain `node fetch()` fails (`TypeError: fetch failed`)
- The app cannot authenticate, load students, or do anything Supabase-related

This is a machine-level network restriction, not a code bug.

---

## 4. Database State

### Remote Supabase project: `fnztncjhvtordyuyljgg`

**All migrations applied** (00001–00009 via `supabase/combined-migration.sql`).

**Trigger fix applied** (`supabase/fix-trigger.sql`):
The `handle_new_user()` function was recreated with `SET search_path = public`
and fully schema-qualified table/type references. Without this fix, every
signup fails because GoTrue's restricted search_path cannot resolve `public.*`
tables and enum types from within the trigger.

**Current tables:**
- `academies` — 1 row (BPM Dublin)
- `users` — real auth users with correct roles
- `student_profiles` — linked to student-role users
- `teacher_profiles` — linked to teacher-role users
- `products`, `student_subscriptions`, `terms` — exist but empty (products/terms live in memory)
- `coc_acceptances` — exists, used by Supabase CoC repo
- All other tables from migrations 00001–00009 exist

**Current users in `public.users`:**

| email | role |
|-------|------|
| blakadder2@gmail.com | student |
| student@bpm.dance | student |
| admin@bpm.dance | admin |
| teacher@bpm.dance | teacher |

---

## 5. Architecture Summary

```
Signup → Supabase Auth (auth.users INSERT)
           ↓ trigger
         handle_new_user()  →  public.users + student_profiles
           ↓
Auth Callback → provisionCurrentUser() (idempotent safety net)
           ↓
Onboarding → CoC acceptance
           ↓
Dashboard → getAuthUser() (lightweight: session → admin DB lookup → metadata fallback)
```

### Data routing (hybrid mode)

| Data | Mock students (s-*, dev-*) | Real Supabase users |
|------|---------------------------|---------------------|
| Student identity | memory | Supabase (`public.users`) |
| Student profiles | memory | Supabase (`student_profiles`) |
| Subscriptions | memory | memory (products not in Supabase yet) |
| Bookings | memory | memory |
| Penalties | memory | memory |
| CoC acceptance | memory | Supabase → memory fallback |

### Key design decisions

- `DATA_PROVIDER` is NOT set (defaults to `"memory"`)
- This is intentional: memory mode + hybrid repos = mock data works, real users also visible
- `getAuthUser()` does NOT call `ensureSupabaseProfile()` — provisioning only happens in auth callback
- The admin client (`createAdminClient()`) bypasses RLS with the service role key
- Hybrid repos log warnings on Supabase failures, never silently swallow

---

## 6. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://fnztncjhvtordyuyljgg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3002

# Dev-only: emails that always see dev tools
DEV_TOOL_ALLOWED_EMAILS=blakadder2@gmail.com
NEXT_PUBLIC_DEV_TOOL_ALLOWED_EMAILS=blakadder2@gmail.com

# DATA_PROVIDER is NOT set — defaults to "memory"
```

Brevo SMTP is configured in the Supabase Dashboard (Authentication → SMTP Settings).
No app-level env vars needed for email delivery.

---

## 7. DO NOT CHANGE Without Full Re-Test

| Item | Why |
|------|-----|
| `handle_new_user()` SQL function | Signup breaks without `SET search_path = public` |
| `supabase/fix-trigger.sql` | Contains the working trigger — reference for any future fix |
| `lib/auth.ts` (resolveSupabaseUser) | Auth resolution must stay lightweight — no provisioning calls |
| `lib/auth-provisioning.ts` | Provisioning logic — only called from auth callback |
| `app/(auth)/auth/callback/page.tsx` | Session exchange + provisioning — the critical post-confirmation path |
| `lib/supabase/admin.ts` | Admin client config — `persistSession: false` is required |
| `lib/repositories/index.ts` | Hybrid repo routing — controls which repos serve real vs mock data |
| Startup command (`NODE_USE_ENV_PROXY=1`) | Network access to Supabase fails without it on this machine |
| `.env.local` | Contains all credentials — never commit, never delete |

---

## 8. SQL Files Reference

| File | Purpose | Applied? |
|------|---------|----------|
| `supabase/combined-migration.sql` | All 9 migrations + backfill in one file | Yes (run in SQL Editor) |
| `supabase/fix-trigger.sql` | Trigger function fix (`SET search_path`) | Yes (run in SQL Editor) |
| `supabase/migrations/00001–00009` | Individual migration files (source of truth) | Yes (via combined) |

---

## 9. Verification Scripts

```bash
# Test that signup works (creates + deletes a test user)
node --env-file=.env.local scripts/verify-signup.mjs
```

---

## 10. Resume Instructions

```bash
cd /Users/lopezmalejandro/Desktop/BPM
NODE_USE_ENV_PROXY=1 npm run dev
# Open http://localhost:3002
```

### Test real signup
1. `/signup` → create account with fresh email
2. Check email for Brevo confirmation link
3. Click link → `/auth/callback` → `/onboarding`
4. Accept CoC → `/dashboard`
5. Verify user appears in Admin > Students

### Key file paths

| What | Where |
|------|-------|
| Auth resolution | `lib/auth.ts` |
| Profile provisioning | `lib/auth-provisioning.ts` |
| Provision action | `lib/actions/auth-provision.ts` |
| Auth callback | `app/(auth)/auth/callback/page.tsx` |
| Repository factory | `lib/repositories/index.ts` |
| Hybrid student repo | `lib/repositories/hybrid-student-repository.ts` |
| Hybrid subscription repo | `lib/repositories/hybrid-subscription-repository.ts` |
| Hybrid CoC repo | `lib/repositories/hybrid-coc-repository.ts` |
| Trigger fix SQL | `supabase/fix-trigger.sql` |
| Admin client | `lib/supabase/admin.ts` |
