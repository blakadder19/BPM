# BPM Booking System

Booking system for **Balance Power Motion (BPM)**, a social dance academy in Dublin.

> **Status:** Functional MVP prototype with in-memory data. No database, auth, or payments yet.
> See `docs/checkpoints/LATEST_CHECKPOINT.md` for current project state.

## Tech Stack

- **Next.js 15** (App Router) with TypeScript
- **Tailwind CSS** for styling
- **Supabase** planned for database + auth (not connected yet)
- **Stripe** planned for payments (not connected yet)
- **Zod** for server-side validation

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables or external services are needed — the app runs entirely with in-memory mock data.

### Dev Tools

- **Role switcher** (topbar): Switch between Admin / Teacher / Student
- **Student impersonation** (topbar, when in Student role): Select any seeded student
- **Dev panel** (bottom-right, when impersonating a student): God-mode actions for testing

## Project Structure

```
app/
├── (auth)/           Auth pages (login) — no sidebar
├── (app)/            Main app shell — sidebar + topbar
│   ├── dashboard/    Overview stats + entitlements
│   ├── classes/      Class browser (student) / templates (admin)
│   ├── bookings/     My bookings (student) / all bookings (admin)
│   ├── attendance/   Mark attendance (admin/teacher)
│   ├── students/     Student directory + subscriptions (admin)
│   ├── terms/        Term management (admin)
│   ├── products/     Memberships, passes, drop-ins (admin)
│   ├── penalties/    Penalty tracking (admin + student)
│   └── settings/     Business rules config (admin)
components/
├── ui/               Reusable primitives (Button, Card, Badge, etc.)
├── layout/           Sidebar, Topbar
├── booking/          Booking flow components
├── dashboard/        Dashboard components
├── dev/              Dev-only testing panel
lib/
├── domain/           Pure business logic (no store/framework imports)
├── services/         In-memory stores and service classes
├── actions/          Server actions (mutations)
├── auth.ts           Dev auth resolution
types/                TypeScript types, Zod schemas
config/               Business rule constants, product access rules
docs/
└── checkpoints/      Project checkpoint documents
```

## Business Rules

Key configurable rules live in `config/business-rules.ts` and `lib/services/settings-store.ts`:

- **Role-balanced styles**: Bachata, Bachata Tradicional, Cuban, Salsa Line
- **Late cancel fee**: €2 (within 60 min of class start) — enabled by default
- **No-show fee**: €5 — disabled by default
- **Socials**: not online-bookable, excluded from penalties
- **Student Practice**: not bookable, pay at reception
- **Beginner intake**: restricted to weeks 1–2 of each term
- **Attendance closure**: +60 min after class start, unchecked bookings become "missed"

Items marked `PROVISIONAL` in code require academy confirmation.
