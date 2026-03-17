# BPM Booking System

Booking system for **Balance Power Motion (BPM)**, a social dance academy in Dublin.

## Tech Stack

- **Next.js 15** (App Router) with TypeScript
- **Tailwind CSS** for styling
- **Supabase** for database, auth, and real-time
- **Zod** for server-side validation

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project credentials.

### 3. Set up Supabase (local)

```bash
supabase init     # if not already initialized
supabase start    # starts local Supabase (Docker required)
supabase db push  # applies migrations
```

Copy the local `anon key` and `API URL` from `supabase start` output into `.env.local`.

### 4. Seed the database

```bash
supabase db reset  # applies migrations + runs seed.sql
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
├── (auth)/           Auth pages (login) — no sidebar
├── (app)/            Main app shell — sidebar + topbar
│   ├── dashboard/    Overview stats
│   ├── classes/      Weekly class schedule
│   ├── bookings/     All bookings
│   ├── attendance/   Mark attendance
│   ├── students/     Student directory
│   ├── products/     Memberships, packs, passes
│   └── settings/     Business rules config
components/
├── ui/               Reusable primitives (Button, Card, Badge, etc.)
├── layout/           Sidebar, Topbar
lib/
├── supabase/         Client, server, and admin Supabase clients
├── domain/           Pure business logic (no DB/framework imports)
├── actions/          Server actions (mutations)
├── queries/          Read-only data fetching
types/                TypeScript types, Zod schemas
config/               Business rule configuration
supabase/
├── migrations/       SQL migration files
└── seed.sql          Development seed data
```

## Business Rules

Key configurable rules live in `config/business-rules.ts`:

- **Role-balanced styles**: Bachata, Bachata Tradicional, Bachata Partnerwork, Cuban, Salsa Line
- **Late cancel fee**: €2 (within 24h of class start)
- **No-show fee**: €5
- **Credit priority**: promo_pass → pack → membership
- **Socials**: not bookable, no penalties

Items marked `PROVISIONAL` in code require academy confirmation.
