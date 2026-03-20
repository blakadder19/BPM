# BPM Operational Checkpoint — 2026-03-20 (Phase 2 Complete)

## 1. Purpose

This checkpoint captures the state after completing the operational persistence
migration (Phase 2), the Phase 1 QA pass, and several focused consistency /
UX hardening passes. Real-user bookings, attendance, penalties, and subscriptions
now persist in Supabase and survive server restarts.

---

## 2. What Is Working

| Area | Status | Notes |
|------|--------|-------|
| Fresh email signup | Working | Supabase Auth → trigger → public.users + student_profiles |
| Email confirmation (Brevo SMTP) | Working | Confirmation link → auth callback → onboarding |
| Onboarding / CoC acceptance | Working | Persists via hybrid CoC repo |
| Real user in Admin > Students | Working | Hybrid student repo; newest-first sorting |
| Student detail panel | Working | Primary profile view: ID, email, phone, role |
| Product/subscription assignment | Working | Persists via op_subscriptions for real users |
| Subscription survives restart | Working | Hydrated from Supabase on server boot |
| Class booking (real user) | Working | Writes to op_bookings for real users |
| Cancel / restore | Working | Credit adjustment + persistence |
| Waitlist join / leave / promotion | Working | Role-aware; writes to op_waitlist |
| Attendance (present/late/absent/excused) | Working | Writes to op_attendance; credit adjustments |
| QR / token check-in | Working | Admin + student self check-in |
| Penalties (no-show / late cancel) | Working | Writes to op_penalties |
| Booking survives restart | Working | Hydrated from op_bookings |
| Attendance survives restart | Working | Hydrated from op_attendance |
| Penalties survive restart | Working | Hydrated from op_penalties |
| Admin dashboard | Working | Uses real system date; scoped to upcoming |
| Admin bookings | Working | Upcoming: soonest first; history accessible |
| Role-required booking | Working | Auto-fills preferredRole from profile |
| Logout + back-button protection | Working | SessionGuard checks Supabase auth cookies |
| Server-restart session invalidation | Working | Boot ID mechanism in middleware |
| Dev tools gating | Working | Hidden by default; Cmd+Shift+D on localhost only |
| Mock/demo student flows | Working | Unaffected by all changes |
| TypeScript / build | Clean | `tsc --noEmit` and `next build` both pass |

---

## 3. Critical Startup Command

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

Node.js on this work laptop cannot reach Supabase without the proxy env var.
This is a machine-level network restriction, not a code bug.

---

## 4. Database State

### Remote Supabase project: `fnztncjhvtordyuyljgg`

**Migrations applied:**

| Migration | Content | Applied? |
|-----------|---------|----------|
| 00001–00009 | Original schema (via combined-migration.sql) | Yes (SQL Editor) |
| fix-trigger.sql | `handle_new_user()` with `SET search_path = public` | Yes (SQL Editor) |
| 00010_operational_tables.sql | op_bookings, op_waitlist, op_attendance, op_penalties | **Must apply** |
| 00011_trigger_preferred_role.sql | Adds preferred_role to trigger + backfill | **Must apply** |
| 00012_op_subscriptions.sql | op_subscriptions table | **Must apply** |
| 00013_trigger_phone.sql | Adds phone to trigger + backfill | **Must apply** |

Migrations 00010–00013 must be run manually in the Supabase SQL Editor in order.

**Operational tables (new in this phase):**

| Table | Purpose |
|-------|---------|
| op_bookings | Real-user booking records (TEXT IDs, no FKs) |
| op_waitlist | Real-user waitlist entries |
| op_attendance | Real-user attendance marks |
| op_penalties | Real-user penalty records |
| op_subscriptions | Real-user subscription/entitlement records |

These tables use TEXT columns for IDs and have no foreign key constraints to
the schedule tables (which are still in-memory). This is intentional — they
serve as a temporary persistence layer until the full schema migration.

---

## 5. Architecture Summary

### Auth flow

```
Signup → Supabase Auth (auth.users INSERT)
           ↓ trigger
         handle_new_user()  →  public.users + student_profiles
           ↓                   (incl. preferred_role, phone)
Auth Callback → provisionCurrentUser() (idempotent safety net)
           ↓
Onboarding → CoC acceptance
           ↓
Dashboard → getAuthUser() (lightweight: getUser() → admin lookup → meta fallback)
```

### Data routing (hybrid + operational persistence)

| Data | Mock students (s-*, dev-*) | Real Supabase users |
|------|---------------------------|---------------------|
| Student identity | memory | Supabase (public.users) |
| Student profiles | memory | Supabase (student_profiles) |
| Subscriptions | memory | memory + write-through to op_subscriptions |
| Bookings | memory | memory + write-through to op_bookings |
| Waitlist | memory | memory + write-through to op_waitlist |
| Attendance | memory | memory + write-through to op_attendance |
| Penalties | memory | memory + write-through to op_penalties |
| CoC acceptance | memory | Supabase (coc_acceptances) |

### Operational persistence pattern: Hydrate + Write-Through

1. On first access per server lifecycle, `ensureOperationalDataHydrated()` loads
   all op_* records from Supabase into the in-memory services.
2. Orphaned records (from deleted/recreated users) are filtered out using
   `loadValidUserIds()` from public.users.
3. On every mutation (book, cancel, mark attendance, etc.), if `isRealUser(id)`
   returns true, the record is also written to the corresponding op_* table.
4. Mock/dev users bypass Supabase writes entirely.

### Session protection

| Mechanism | Protects against |
|-----------|-----------------|
| Middleware boot ID (bpm-sid) | Server restart — forces re-login |
| Cache-Control: no-store | Browser HTTP cache of protected pages |
| SessionGuard (client-side) | SPA back-navigation after logout (checks sb-*-auth-token cookies) |

### Dev tools gating

Dev tools (topbar controls + floating panel) are hidden by default.
Unlock: Cmd/Ctrl+Shift+D on localhost in development only.
The unlock state is stored in localStorage (`bpm-dev-unlocked`).
Production and LAN access always have dev tools fully hidden.

---

## 6. Key Files Added/Changed Since Last Checkpoint

### New files

| File | Purpose |
|------|---------|
| `lib/supabase/operational-persistence.ts` | CRUD for op_* tables |
| `lib/supabase/hydrate-operational.ts` | Hydration + orphan filtering |
| `lib/utils/is-real-user.ts` | UUID regex to distinguish real from mock |
| `lib/hooks/use-dev-unlock.ts` | Dev tools unlock hook (localStorage + keyboard) |
| `components/layout/session-guard.tsx` | Client-side auth guard (replaces BFCacheGuard) |
| `components/dev/dev-panel-gate.tsx` | DevPanel visibility wrapper |
| `supabase/migrations/00010–00013` | Operational tables + trigger updates |

### Significantly modified files

| File | Changes |
|------|---------|
| `middleware.ts` | Boot ID, Cache-Control, unconfirmed-user guard |
| `lib/auth.ts` | getUser() instead of getSession() |
| `lib/actions/auth.ts` | Cookie cleanup on logout |
| `lib/actions/booking.ts` | Hydration + write-through + repo-based lookups |
| `lib/actions/booking-student.ts` | Hydration + write-through |
| `lib/actions/bookings-admin.ts` | Hydration + write-through + requireRole |
| `lib/actions/attendance.ts` | Hydration + write-through + async entitlement |
| `lib/actions/checkin.ts` | Hydration + write-through |
| `lib/actions/dev-tools.ts` | Hydration + write-through |
| `lib/actions/penalties-admin.ts` | Hydration + write-through |
| `lib/actions/waitlist-student.ts` | Repo-based student lookup |
| `lib/services/subscription-service.ts` | Write-through to op_subscriptions |
| `lib/services/booking-service.ts` | Waitlist maxPos filters active only |
| `components/dashboard/admin-dashboard.ts` | Real system date, upcoming-scoped |
| `components/booking/admin-bookings.tsx` | Upcoming-first sorting |
| `components/students/admin-students.tsx` | Newest-first, enhanced detail panel |
| `components/booking/class-browser.tsx` | Preferred role pass-through |
| `components/booking/student-book-dialog.tsx` | Auto-fill preferred role |
| `components/layout/topbar.tsx` | Dev unlock hook, capitalized role label |
| `app/(app)/layout.tsx` | Simplified: DevPanelGate, removed email allowlist |
| All `app/(app)/*/page.tsx` files | Added `ensureOperationalDataHydrated()` |

---

## 7. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://fnztncjhvtordyuyljgg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3002

# DATA_PROVIDER is NOT set — defaults to "memory"
# DEV_TOOL_ALLOWED_EMAILS is no longer required (replaced by keyboard unlock)
```

Brevo SMTP is configured in the Supabase Dashboard (Authentication → SMTP Settings).

---

## 8. DO NOT CHANGE Without Full Re-Test

| Item | Why |
|------|-----|
| `handle_new_user()` trigger SQL | Signup breaks without `SET search_path = public` |
| `lib/auth.ts` (resolveSupabaseUser) | Must use getUser(), must stay lightweight |
| `lib/supabase/hydrate-operational.ts` | Hydration + orphan filter — operational data depends on it |
| `lib/supabase/operational-persistence.ts` | All op_* CRUD — write-through depends on it |
| `middleware.ts` | Boot ID, session guard cookies, unconfirmed guard |
| `components/layout/session-guard.tsx` | Prevents back-button into protected pages after logout |
| Startup command (`NODE_USE_ENV_PROXY=1`) | Network access fails without it on this machine |
| `.env.local` | Contains all credentials — never commit, never delete |

---

## 9. What Still Remains In Memory / Hybrid

| Area | Current State | Next Step |
|------|---------------|-----------|
| Schedule (classes, terms, teachers) | Fully in memory (mock data) | Migrate to Supabase |
| Products catalog | In memory (mock data) | Migrate to Supabase |
| Wallet transactions | In memory (mock data) | Will follow payments integration |
| Email notifications | Not implemented | Add booking/cancel notifications |
| Stripe payments | Placeholder-ready | Not started |
| Camera QR scanning | Not implemented | Add to attendance flow |
| Production deployment | Not done | Custom domain + Supabase link config |

---

## 10. Known Architectural Limitations

1. **op_* tables have TEXT IDs, no FKs**: By design for this phase. The schedule
   is still in memory with string IDs. When schedule migrates to Supabase, these
   tables should be replaced or augmented with proper FK relationships.

2. **Hydrate-once-per-lifecycle**: Operational data is loaded from Supabase once
   per server process start. HMR in development resets hydration flags correctly.
   In production, a long-running server accumulates in-memory state.

3. **No real-time sync**: If data is modified directly in Supabase (outside the
   app), it won't reflect until the next server restart/hydration.

4. **Mock data coexists**: In-memory mock data (seeded from `lib/mock-data`) runs
   alongside real Supabase data. This is intentional for development but means
   admin views show both mock and real students/bookings.

---

## 11. Resume Instructions

```bash
cd /Users/lopezmalejandro/Desktop/BPM
NODE_USE_ENV_PROXY=1 npm run dev
# Open http://localhost:3002
# Unlock dev tools: Cmd+Shift+D (localhost only)
```

### Apply new migrations (if not yet applied)

Run these in order in the Supabase SQL Editor:

1. `supabase/migrations/00010_operational_tables.sql`
2. `supabase/migrations/00011_trigger_preferred_role.sql`
3. `supabase/migrations/00012_op_subscriptions.sql`
4. `supabase/migrations/00013_trigger_phone.sql`

### Test real user flow

1. `/signup` → create account with fresh email
2. Check email for Brevo confirmation link
3. Click link → `/auth/callback` → `/onboarding`
4. Accept CoC → `/dashboard`
5. Verify user in Admin > Students (phone + role visible)
6. Assign subscription → book a class → cancel → verify persistence after restart

---

## 12. Next Recommended Phase

1. **Apply migrations 00010–00013** to remote Supabase (if not yet done)
2. **Migrate schedule to Supabase**: classes, terms, teachers, teacher pairs
3. **Migrate products to Supabase**: products, pricing, term associations
4. **Replace op_* tables** with properly constrained tables once schedule/products exist in DB
5. **Custom domain + production deployment** for real user access
