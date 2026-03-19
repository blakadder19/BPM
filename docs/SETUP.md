# BPM Local Development Setup

## Prerequisites

- Node.js 18+
- npm
- (Optional) [Supabase CLI](https://supabase.com/docs/guides/cli) for local DB mode

## Quick Start (Memory Mode)

Memory mode is the default. No database or external services needed.

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs entirely in-memory with seeded mock data.

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
npm run dev
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

## Supabase Mode (Hosted / Staging / Production)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run migrations against the hosted DB:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. (Optional) Seed data:
   ```bash
   psql <hosted-connection-string> -f supabase/seed.sql
   ```
4. Update `.env.local` with the hosted project URL and keys
5. Set `DATA_PROVIDER=supabase`

## Switching Between Modes

You can switch freely between memory and supabase modes by changing `DATA_PROVIDER` in `.env.local` and restarting the dev server. No other changes needed.

- **Memory mode**: All data resets on server restart (or on HMR for some stores). Dev tools available.
- **Supabase mode**: Data persists in the database. Auth uses real Supabase sessions. Dev tools still available in development but some memory-only shortcuts may not apply.

## Architecture Notes

The app uses a **Repository Pattern** to abstract data access:

```
Pages/Actions → Service Layer → Repository Factory → Memory or Supabase Implementation
```

- Repository interfaces: `lib/repositories/interfaces/`
- Memory implementations: `lib/repositories/memory/` (wrap existing in-memory stores)
- Supabase implementations: `lib/repositories/supabase/` (real DB access for identity/commercial modules, stubs for operational modules)
- Factory: `lib/repositories/index.ts` (selects implementation based on `DATA_PROVIDER`)

### Modules by migration status

| Module | Memory | Supabase |
|--------|--------|----------|
| Students | Full | Full |
| Products | Full | Full |
| Terms | Full | Full |
| Subscriptions | Full | Full |
| Code of Conduct | Full | Full |
| Bookings | Full | Stub (pending) |
| Attendance | Full | Stub (pending) |
| Penalties | Full | Stub (pending) |
| Credits | Full | Stub (pending) |
| Settings | Full | Stub (pending) |
