# BPM — Latest Checkpoint

**Date:** 2026-03-18
**Full checkpoint:** [`docs/checkpoints/bpm-checkpoint-2026-03-18.md`](./bpm-checkpoint-2026-03-18.md)

---

## Current State

- Terms foundation: 4-week cycles, active/upcoming/past, beginner entry restriction (weeks 1–2)
- Products: membership / pass / drop_in with access-rule engine and credit models
- Student entitlements: subscription store with credit/class tracking, globalThis persistence
- Class schedule: templates + date-specific instances, 8 dance styles, role-balance flags
- Admin bookings: full CRUD, cancel/restore, check-in, waitlist management
- Student booking: 10-step bookability engine, duplicate prevention, restore-available
- Waitlist: automatic role-aware FIFO with promotion on cancellation
- Cancellation/restore: credit restoration, late-cancel penalties, reversible before class start
- Code of Conduct: versioned acceptance, enforced before booking, CTA on dashboard and class cards
- QR/token check-in: per-booking tokens, QR display, token validation, student QR dialog
- Self-check-in: time-limited, configurable window, server-validated
- Admin/staff check-in: operational override with no opening-window restriction
- Attendance closure: unchecked confirmed → missed after configurable window (+60min default)
- Attendance corrections: state machine with credit reversal and penalty lifecycle management
- Student-visible status: attendance outcome overrides raw booking status in student UI
- Penalties: late_cancel / no_show, 4 resolution types, student-hidden for attendance corrections
- Settings: configurable penalty fees, check-in rules, role balance, class type bookability
- Dev tools: role switcher, student impersonation, God Mode panel with full domain actions

## What Works

- Complete student booking flow: browse → accept CoC → book → view QR → cancel → restore
- Admin attendance: manual check-in, token check-in, attendance marking with state machine
- Credit management: consumption on book, restoration on cancel/absent/excused, re-consumption on restore
- Waitlist with automatic role-aware promotion
- Penalties with full lifecycle including attendance-correction hiding
- All flows interconnected and live in dev mode

## What Remains

- In-memory only — no production persistence (Supabase migration needed)
- No real authentication (dev cookie-based only)
- No real payments (Stripe placeholder-ready)
- No device camera QR scanning (display-only)
- No email/SMS notifications
- No student self-registration
- No teacher-specific portal

## Next Recommended Phase

**Production Foundation:** Supabase persistence, real auth, student self-registration, email notifications, and QR camera scanning.
