# BPM Local Development Setup

## Prerequisites

- Node.js 18+
- npm
- (Optional) [Supabase CLI](https://supabase.com/docs/guides/cli) for local DB mode

## Quick Start (Hybrid Mode — Current Default)

The app runs in memory mode by default but connects to a real remote
Supabase project for authentication and student identity. Mock data
coexists with real Supabase users via hybrid repositories.

```bash
# Install dependencies
npm install

# Start the dev server
# IMPORTANT: NODE_USE_ENV_PROXY=1 is required on machines where Node.js
# cannot reach external HTTPS endpoints without the system proxy.
# Without it, all Supabase calls fail with "TypeError: fetch failed".
NODE_USE_ENV_PROXY=1 npm run dev
```

Open [http://localhost:3002](http://localhost:3002).

> **Network note:** If `curl https://fnztncjhvtordyuyljgg.supabase.co` works
> but `node -e "fetch('https://fnztncjhvtordyuyljgg.supabase.co').then(r=>console.log(r.status))"` fails,
> you need `NODE_USE_ENV_PROXY=1`.

### Dev Identity

In memory mode, the app uses cookie-based dev identity. The dev panel (bottom-right) lets you switch between admin/student roles and impersonate specific students.

- **Admin view**: Default. Navigate to any admin page.
- **Student view**: Use the topbar dropdown to select a student.

## Data Provider Modes

The `DATA_PROVIDER` environment variable controls which data backend is used.

| Value | Description |
|-------|-------------|
| `memory` (default) | In-memory mock stores, seeded from `lib/mock-data.ts`. No DB needed. |
| `supabase` | Real Supabase database. Requires running instance + credentials. |

Set it in `.env.local`:

```env
DATA_PROVIDER=memory
```

## Supabase Mode (Local)

### 1. Install Supabase CLI

```bash
brew install supabase/tap/supabase
# or: npm install -g supabase
```

### 2. Start local Supabase

```bash
supabase start
```

This starts PostgreSQL, Auth, and other services locally via Docker.

### 3. Apply migrations and seed data

```bash
supabase db reset
```

This runs all migrations in `supabase/migrations/` and the seed file at `supabase/seed.sql`.

### 4. Configure environment

Copy `.env.local.example` to `.env.local` and update:

```env
DATA_PROVIDER=supabase

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Start the app

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

### Test Accounts (Supabase mode)

All seeded users have the password `password123`:

| Role | Email | Notes |
|------|-------|-------|
| Admin | admin@bpm.dance | Full admin access |
| Teacher | maria@bpm.dance | Teacher view |
| Teacher | carlos@bpm.dance | Teacher view |
| Student | alice@test.com | 8 Classes Membership, CoC accepted |
| Student | bob@test.com | Beginners 1&2 Pass (Bachata), CoC accepted |
| Student | carol@test.com | 4 Classes Membership |
| Student | dave@test.com | 16 Classes Membership |
| Student | eve@test.com | No subscription |
| Student | fiona@test.com | 12 Classes Membership (complimentary), CoC accepted |
| Student | gary@test.com | No subscription |
| Student | hannah@test.com | No subscription |

## Supabase Mode (Hosted — Current Setup)

The current working configuration uses a hosted Supabase project
(`fnztncjhvtordyuyljgg`) with `DATA_PROVIDER` left at the default
(`"memory"`). This gives hybrid behavior: real Supabase auth +
student identity, with mock data for products/bookings/penalties.

### Initial setup (already done)

1. All migrations applied via `supabase/combined-migration.sql` in the SQL Editor
2. Trigger fix applied via `supabase/fix-trigger.sql` in the SQL Editor
3. Brevo SMTP configured in Supabase Dashboard → Authentication → SMTP Settings
4. `.env.local` configured with project URL, anon key, and service role key

### If starting fresh on a new Supabase project

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run `supabase/combined-migration.sql` in the SQL Editor
3. Run `supabase/fix-trigger.sql` in the SQL Editor (critical for signup)
4. Configure Brevo SMTP in Authentication → SMTP Settings
5. Update `.env.local` with the new project URL and keys
6. Seed an academy: `INSERT INTO academies (name, slug) VALUES ('BPM Dublin', 'bpm-dublin');`

## Switching Between Modes

You can switch freely between memory and supabase modes by changing `DATA_PROVIDER` in `.env.local` and restarting the dev server. No other changes needed.

- **Memory mode**: All data resets on server restart (or on HMR for some stores). Dev tools available.
- **Supabase mode**: Data persists in the database. Auth uses real Supabase sessions. Dev tools still available in development but some memory-only shortcuts may not apply.

## Architecture Notes

The app uses a **Repository Pattern** to abstract data access:

```
Pages/Actions → Service Layer → Repository Factory → Memory, Supabase, or Hybrid Implementation
```

- Repository interfaces: `lib/repositories/interfaces/`
- Memory implementations: `lib/repositories/memory/`
- Supabase implementations: `lib/repositories/supabase/`
- Hybrid implementations: `lib/repositories/hybrid-*.ts` (merge memory + Supabase)
- Factory: `lib/repositories/index.ts` (selects implementation based on `DATA_PROVIDER`)

### Current repo routing (DATA_PROVIDER=memory, the default)

| Module | Repo used | Real user data source |
|--------|-----------|----------------------|
| Students | **hybrid** | Supabase `public.users` + `student_profiles` |
| Subscriptions | **hybrid** | memory (products not in Supabase yet) |
| Code of Conduct | **hybrid** | Supabase `coc_acceptances` → memory fallback |
| Products | memory | memory only |
| Terms | memory | memory only |
| Bookings | memory | memory only |
| Attendance | memory | memory only |
| Penalties | memory | memory only |
| Credits | memory | memory only |
| Settings | memory | memory only |
