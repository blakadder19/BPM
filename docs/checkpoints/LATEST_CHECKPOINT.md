# BPM — Latest Checkpoint

**Date:** 2026-03-19
**Full checkpoint:** [`docs/checkpoints/bpm-checkpoint-2026-03-19.md`](./bpm-checkpoint-2026-03-19.md)

---

## Current State

- Terms foundation: 4-week cycles, active/upcoming/past, beginner entry restriction (weeks 1–2)
- Products: 12 products — 4 memberships (4/8/12/16), 3 passes, 2 promo passes, 1 drop-in, 1 social pass
- Product descriptions: short + long descriptions on all products, dance style descriptions, class-level descriptions with tooltips
- Student entitlements: subscription store with credit/class tracking, payment metadata (method, status, assignedBy, assignedAt)
- Member benefits: birthday-week free class foundation, giveaway eligibility, free weekend Student Practice — all computed and displayed
- Payment methods: 7 options including Revolut and Card; 4 payment statuses (paid, pending, complimentary, waived)
- Historical status display: Finished / Expired / Cancelled / Replaced — context-aware derivation, no more "Exhausted"
- Active vs historical products clearly separated in admin with contextual status badges
- Class schedule: templates + date-specific instances, 8 dance styles with descriptions, role-balance flags
- Admin bookings: full CRUD, cancel/restore, check-in, waitlist management
- Student booking: 10-step bookability engine, duplicate prevention, restore-available
- Waitlist: automatic role-aware FIFO with promotion on cancellation
- Cancellation/restore: credit restoration, late-cancel penalties, reversible before class start
- Code of Conduct: versioned acceptance, enforced before booking
- QR/token check-in: per-booking tokens, QR display, token validation, self-check-in
- Attendance closure: unchecked confirmed → missed after configurable window
- Attendance corrections: state machine with credit reversal and penalty lifecycle
- Penalties: late_cancel / no_show, 4 resolution types, student-hidden for corrections
- Settings: configurable penalty fees, check-in rules, role balance, class type bookability
- Dev tools: role switcher, student impersonation, God Mode panel with full domain actions

## Latest Milestone

**Product catalog, member benefits, payment metadata, and historical status display refinement.**

Key additions: final product catalog with descriptions, birthday-week eligibility foundation, giveaway eligibility, free Student Practice member benefit, Revolut payment method, payment status/metadata recording, academy-friendly historical status labels (Finished/Expired/Cancelled/Replaced).

## What Works

- Complete product catalog reflecting real academy offerings with 4 membership tiers
- Member benefits visible in student dashboard and admin panel (birthday, giveaway, practice)
- Admin product assignment with payment method (including Revolut) and status recording
- Historical subscriptions display truthful contextual status instead of "Exhausted"
- Complete student booking flow: browse → accept CoC → book → view QR → cancel → restore
- Admin attendance: manual check-in, token check-in, attendance marking with state machine
- Credit management: consumption on book, restoration on cancel/absent/excused
- Waitlist with automatic role-aware promotion
- Penalties with full lifecycle including attendance-correction hiding
- 166 non-penalty tests passing, TypeScript clean

## What Remains

- Birthday free class not auto-applied during booking (foundation only)
- In-memory only — no production persistence (Supabase migration needed)
- No real authentication (dev cookie-based only)
- No real payments (Stripe/Revolut placeholder-ready)
- Waitlist promotion doesn't deduct credits
- No email/SMS notifications
- No student self-registration

## Next Recommended Phase

**Data Consistency Hardening:** Waitlist credit deduction, birthday free class auto-application, fix admin MOCK_TODAY, reconcile Mock/canonical types. Then: Supabase integration, real auth, payment integration.
