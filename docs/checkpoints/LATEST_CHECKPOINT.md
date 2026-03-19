# BPM — Latest Checkpoint

**Date:** 2026-03-19
**Full checkpoint:** `docs/checkpoints/bpm-checkpoint-2026-03-19.md`

---

## Current State (20 bullets)

- Functional MVP prototype — all core booking flows work end-to-end
- Next.js 15 App Router + TypeScript + Tailwind CSS
- In-memory stores with mock data, no database yet
- Dev-only auth via cookies, no real authentication
- 9 routes: Dashboard, Classes, Bookings, Attendance, Students, Terms, Products, Penalties, Settings
- 12 products (4 memberships, 3 passes, 1 drop-in, 3 specialty, 1 social)
- 8 seeded students with 7 subscriptions
- 2 terms (Spring active, Summer upcoming), 4-week model
- 17 bookable class instances across multiple styles/levels
- Student class browser with bookability engine (7 states: bookable, waitlistable, already_booked, already_waitlisted, restore_available, blocked, not_bookable)
- 3-layer duplicate booking prevention (bookability engine + server action + service)
- Student cancel with late-cancel detection, credit restoration, penalty creation
- Student restore with capacity check (confirmed or re-waitlisted)
- Attendance closure: missed status after +60 min, no auto-penalty
- Configurable penalties (late-cancel ON, no-show OFF by default)
- Role-balanced waitlist with auto-promotion on cancel
- Dev impersonation: switch to any seeded student instantly
- Dev panel: god-mode actions for entitlements, bookings, penalties
- Settings page: fees, cutoffs, toggles, all persisted to disk
- Admin dashboard with KPIs, fill rates, attendance summary

## What Works

- Admin CRUD for terms, products, students, class templates, subscriptions
- Student books class with entitlement validation and role selection
- Student joins waitlist when class is full, auto-promoted on cancellation
- Student cancels booking (free or late-cancel) with credit restoration
- Student restores cancelled booking (from My Bookings or Classes page)
- Duplicate booking prevention with restore-first flow
- Attendance marking (present/late/absent/excused) with auto check-in
- Attendance closure marks unchecked bookings as missed
- Penalty creation/waiving with credit-deduction or monetary-pending resolution
- Dashboard shows live entitlement counts after booking/cancel/restore
- Dev tools: impersonation + god-mode panel for rapid testing

## What Remains

- No real database (Supabase schema and migration needed)
- No real authentication (Supabase Auth integration needed)
- No payments (Stripe integration needed)
- Waitlist auto-promotion doesn't deduct entitlement credits
- Some stores (term, product, student, schedule) not HMR-safe (module-level let)
- Admin dashboard uses hardcoded date instead of live date
- Course-group (Latin Combo) style matching has incomplete fallback
- No-show penalty passes empty subscription list (credit deduction never works)
- No email notifications
- No QR check-in
- Mock types diverge from canonical domain types (reconciliation needed for DB migration)

## Recommended Next Phase

**Phase 3: Waitlist Credit Deduction + Data Consistency Hardening**
1. Fix waitlist promotion credit deduction
2. Migrate remaining stores to globalThis pattern
3. Fix admin dashboard hardcoded date
4. Fix no-show penalty subscription lookup
5. Complete course_group style matching
6. Reconcile mock types with canonical types

Then: Phase 4 (Supabase), Phase 5 (Stripe)

## How to Resume

```bash
cd /Users/lopezmalejandro/Desktop/BPM && npm run dev
```

- Read `docs/checkpoints/bpm-checkpoint-2026-03-19.md` for full context
- Use dev role switcher (topbar) to switch between admin/teacher/student
- Impersonate students via pink dropdown (Alice Murphy recommended for testing)
- Dev panel (bottom-right) for quick entitlement/booking/penalty manipulation
