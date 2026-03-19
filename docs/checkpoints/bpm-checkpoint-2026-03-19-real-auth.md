# BPM Project Checkpoint — 2026-03-19 (Real Auth Integration)

## 1. Project Snapshot

**Branch:** `main`
**Previous commit:** `4e61b48` (product catalog, member benefits, payment metadata checkpoint)
**Supabase project:** `fnztncjhvtordyuyljgg` (remote, hosted)
**SMTP:** Brevo, configured in Supabase dashboard (Auth → SMTP Settings)

**What changed since last checkpoint:**
The project transitioned from a pure in-memory prototype to a hybrid system where real Supabase auth coexists with the in-memory mock data layer. Users can now sign up with real email/password, receive confirmation emails via Brevo SMTP, and land in the app as authenticated students.

---

## 2. Architecture Changes

### Auth System (NEW)

- **Real Supabase Auth** — email/password signup with email confirmation
- **Brevo SMTP** — transactional emails for confirmation, configured in Supabase dashboard
- **Auth resolution priority:** real Supabase session first → dev cookie identity fallback (memory mode only)
- **`emailConfirmed` guard** — all `(app)` routes redirect unconfirmed users to `/signup?awaiting=1`
- **`BFCacheGuard`** — client component forces server refresh when browser restores from Back-Forward Cache

### Repository System (NEW)

- **Full repository abstraction:** `IStudentRepository`, `ICocRepository`, `IProductRepository`, etc.
- **Three implementations per repo:** `memory/`, `supabase/`, and where needed `hybrid-*`
- **`DATA_PROVIDER` env var** controls which backend is used (default: `"memory"`)
- **Hybrid student repo:** merges mock students (memory) + real Supabase students when Supabase is configured — used in memory mode so real signed-up users appear alongside mock data
- **Hybrid CoC repo:** routes mock IDs (`s-*`, `dev-*`) to memory, real UUIDs to Supabase; falls back to memory on Supabase error (e.g., table not yet migrated)

### Admin Client Fix

- `createAdminClient()` now configured with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — prevents GoTrue session management from interfering with server-side `fetch`

### Signup / Onboarding Flow (NEW)

- `/signup` — real email/password signup with preferred role, date of birth, phone
- `/signup?awaiting=1` — "Check your email" confirmation screen, stable across refresh
- `/auth/callback` — handles PKCE code exchange and implicit token-hash flows
- `/onboarding` — Code of Conduct acceptance screen, redirects to `/dashboard` on success

### Dev Tools Enhancements

- **Allowlist:** `DEV_TOOL_ALLOWED_EMAILS` (+ `NEXT_PUBLIC_` variant) controls which real authenticated emails see full dev tools in development
- **Floating DevPanel** visible for allowlisted users without requiring impersonation
- **Dev tools work for real users:** `resolveStudentName`, `devGetStudentState`, `devSwitchRole` all fall back to `getStudentRepo().getById()` which uses the hybrid repo

---

## 3. What Is Working

### Auth
- [x] Real email/password signup via Supabase Auth
- [x] Brevo SMTP sends confirmation emails
- [x] Email confirmation callback (PKCE + implicit)
- [x] Session resolution: real Supabase → dev fallback
- [x] `emailConfirmed` guard blocks unconfirmed users from all `(app)` routes
- [x] "Check your email" screen stays stable on refresh
- [x] Login/logout with real Supabase sessions
- [x] Dev cookie identity still works when no real session exists

### Onboarding
- [x] CoC acceptance persists (Supabase if table exists, memory fallback if not)
- [x] Success screen with auto-redirect to `/dashboard` via `window.location.replace`
- [x] Fallback "Go to dashboard" link on success screen
- [x] Onboarding page redirects to `/dashboard` if CoC already accepted

### Hybrid Repos
- [x] Real signed-up users appear in Admin Students list (hybrid student repo)
- [x] `getStudentRepo().getById(realUUID)` resolves real users from Supabase
- [x] Dev tools can target real authenticated user without impersonation
- [x] CoC read/write uses same identity key (hybrid repo with Supabase→memory fallback)
- [x] Mock students and mock data flows unaffected

### Dev Tools
- [x] Allowlisted real email sees full floating dev panel
- [x] Impersonation still works for mock students
- [x] Dev panel targets real authenticated user when not impersonating
- [x] Role switcher, student picker in topbar

### Pre-existing (unchanged)
- [x] Full booking flow: browse → CoC → book → QR → cancel → restore
- [x] Admin: terms, products, students, attendance, penalties
- [x] Waitlist with role-aware FIFO
- [x] Credit management, penalty lifecycle
- [x] 12 products, 4 membership tiers, payment metadata

---

## 4. What Is Still Broken / Known Issues

### Critical — Supabase Schema Not Migrated
- **Migration `00009_schema_alignment.sql` has NOT been applied to the remote Supabase project.** This migration creates `terms`, `coc_acceptances`, and `birthday_redemptions` tables. Without it, CoC acceptance falls back to memory (works per-session, lost on server restart).
- **Action required:** Run migration `00009` via Supabase Dashboard SQL Editor before next session.

### Real User Data Gaps
- **Subscriptions/bookings/penalties are still memory-only.** The subscription, booking, and penalty stores are not hybridized. A real signed-up user appears in Admin Students but cannot have subscriptions assigned through the existing admin flow (the subscription store uses mock IDs, not real UUIDs).
- **Product assignment for real users:** `devAssignProduct` uses the in-memory `createSubscription` which writes to the memory store. This works for mock students but is ephemeral for real users.
- **Wallet transactions:** `getWalletTransactions()` reads from mock data only.

### CoC Persistence
- CoC acceptance for real users falls back to in-memory store when `coc_acceptances` table doesn't exist in Supabase. Acceptance is lost on server restart until migration 00009 is applied.

### Dev Panel Environment
- `DEV_TOOL_ALLOWED_EMAILS` requires a dev server restart to take effect after being added/changed in `.env.local`. The `NEXT_PUBLIC_` variant helps but is still subject to build-time inlining.

### Pre-existing (unchanged from prior checkpoint)
- 8 penalty-related test failures (no-show penalties OFF by default)
- Waitlist promotion doesn't deduct credits
- Birthday free class not auto-applied during booking
- Admin dashboard uses hardcoded MOCK_TODAY
- MockProduct / MockSubscription type gaps vs canonical types

---

## 5. Environment Variables Required

```env
# Supabase (real remote project)
NEXT_PUBLIC_SUPABASE_URL=https://fnztncjhvtordyuyljgg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3002

# Dev-only: emails that always see dev tools when authenticated
DEV_TOOL_ALLOWED_EMAILS=blakadder2@gmail.com
NEXT_PUBLIC_DEV_TOOL_ALLOWED_EMAILS=blakadder2@gmail.com

# DATA_PROVIDER is NOT set — defaults to "memory"
# This is intentional: keeps mock data working while Supabase handles auth + students
```

**Brevo SMTP** is configured directly in the Supabase Dashboard under Authentication → SMTP Settings. No app-level env vars are needed for email delivery.

---

## 6. New Files Added In This Phase

| File | Purpose |
|---|---|
| `app/(auth)/signup/page.tsx` | Real email/password signup form |
| `app/(auth)/auth/callback/page.tsx` | Auth callback (PKCE + implicit flow) |
| `app/(app)/onboarding/page.tsx` | CoC acceptance guard before dashboard |
| `components/onboarding/onboarding-flow.tsx` | Client-side CoC acceptance UI + redirect |
| `components/layout/bfcache-guard.tsx` | BFCache detection → forces server refresh |
| `docs/SETUP.md` | Project setup documentation |
| `lib/config/data-provider.ts` | `DATA_PROVIDER` env var reader |
| `lib/repositories/index.ts` | Repository factory (memory / supabase / hybrid) |
| `lib/repositories/interfaces/*.ts` | 10 repository interfaces |
| `lib/repositories/memory/*.ts` | 10 memory implementations |
| `lib/repositories/supabase/*.ts` | 10 Supabase implementations |
| `lib/repositories/hybrid-student-repository.ts` | Merges mock + real Supabase students |
| `lib/repositories/hybrid-coc-repository.ts` | Routes mock→memory, real→Supabase (with fallback) |
| `supabase/migrations/00009_schema_alignment.sql` | Terms, CoC, birthday tables + RLS policies |

---

## 7. Key Modified Files

| File | Change |
|---|---|
| `lib/auth.ts` | `emailConfirmed` field, Supabase session resolution, dev fallback |
| `middleware.ts` | Exclude `/signup` from authenticated redirect |
| `app/(app)/layout.tsx` | `emailConfirmed` guard, dev allowlist, BFCacheGuard, hybrid student list |
| `lib/supabase/admin.ts` | Server-side auth options for admin client |
| `lib/actions/code-of-conduct.ts` | try-catch error handling |
| `lib/actions/dev-tools.ts` | `resolveStudentName` with hybrid repo fallback, real user shell state |
| `types/database.ts` | Full Supabase schema types including new tables |
| `components/layout/topbar.tsx` | Dev controls default to NODE_ENV check |

---

## 8. Recommended Next Priorities

### Immediate (before next feature work)
1. **Apply migration 00009 to remote Supabase** — run the SQL in Supabase Dashboard → SQL Editor
2. **Verify CoC persists in Supabase** — accept CoC, restart dev server, confirm it's still accepted
3. **Verify real user appears in Admin Students after restart** — the hybrid student repo should fetch from Supabase

### Short-term
4. **Hybridize subscription repo** — so admin can assign products to real users and the assignments persist
5. **Reconcile mock types with Supabase schema** — prepare for full Supabase mode
6. **Custom domain / confirmation links** — point Supabase auth redirect URLs to production domain when ready

### Medium-term
7. **Full Supabase mode** — set `DATA_PROVIDER=supabase` and ensure all repos work
8. **Payment integration** — Stripe/Revolut for real subscriptions
9. **Email notifications** — booking confirmations, cancellation notices

---

## 9. Resume Instructions

```bash
cd /Users/lopezmalejandro/Desktop/BPM
npm run dev
# Open http://localhost:3002
```

### Testing real auth
1. Go to `/signup` → create account with real email
2. Check email for Brevo-delivered confirmation link
3. Click confirmation → lands in `/onboarding`
4. Accept Code of Conduct → redirects to `/dashboard`
5. In Admin Students, the real user should appear in the list

### Testing dev tools for real user
1. Sign in as `blakadder2@gmail.com` (allowlisted)
2. Full floating dev panel should appear (bottom-right)
3. Dev panel shows CoC status and allows accept/revoke

### Key paths
| What | Where |
|---|---|
| Repository factory | `lib/repositories/index.ts` |
| Auth resolution | `lib/auth.ts` |
| Hybrid student repo | `lib/repositories/hybrid-student-repository.ts` |
| Hybrid CoC repo | `lib/repositories/hybrid-coc-repository.ts` |
| Data provider config | `lib/config/data-provider.ts` |
| Supabase admin client | `lib/supabase/admin.ts` |
| Migration to apply | `supabase/migrations/00009_schema_alignment.sql` |
