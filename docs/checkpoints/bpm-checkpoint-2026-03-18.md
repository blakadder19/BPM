# BPM Project Checkpoint — 2026-03-18

## 1. Project Snapshot

**What BPM is:** A lightweight booking system for Balance Power Motion (BPM), a social dance academy in Dublin. It handles class scheduling, student entitlements (memberships/passes/drop-ins), bookings with role-balance awareness, waitlisting, cancellation/restore, attendance tracking with QR-ready check-in, Code of Conduct enforcement, and penalty management.

**Prototype status:** Functional local prototype with full in-memory data stores. All core operational flows work end-to-end in dev mode. No production deployment, no real auth, no real payments.

**Architecture:**
- Next.js App Router + TypeScript + Tailwind CSS
- In-memory data stores seeded from mock data, using `globalThis` for HMR resilience
- Pure domain logic in `lib/domain/` (no framework imports)
- Service layer in `lib/services/` wrapping stores
- Server actions in `lib/actions/` orchestrating domain + service calls
- File-backed settings at `.data/settings.json`
- Dev-only tools: role switcher, student impersonation, "God Mode" dev panel

**Environment:** Local dev only. Supabase types exist and student-service has partial production reads, but all other stores are mock/in-memory.

---

## 2. What Is Implemented

### Terms
- 4-week term model with `active`/`upcoming`/`past` status derivation
- Term CRUD (admin page at `/terms`)
- Domain helpers: `getCurrentTerm`, `getNextTerm`, `findTermForDate`, `getTermWeekNumber`, `isBeginnerEntryWeek` (weeks 1–2), `isBeginnerEntryClass`
- Seeded: Spring 2026 (active), Summer 2026 (upcoming)

### Products
- Product types: `membership`, `pass`, `drop_in`
- Full CRUD (admin page at `/products`)
- Access rule engine: `StyleAccess` discriminated union (`all | fixed | selected_style | course_group | social_only`)
- Hardcoded `PRODUCT_ACCESS_RULES` mapping 11 products to allowed class types/styles/levels
- Latin Combo mapping is PROVISIONAL (pick 2 of 3 Beginner 1 Latin styles)
- Class type config: `class` (bookable, penalties, credits), `social` (not bookable), `student_practice` (configurable)

### Students / Entitlements
- Student CRUD (admin page at `/students`)
- Subscription store with globalThis persistence: `totalCredits`, `remainingCredits`, `classesUsed`, `classesPerTerm`, `termId`, `selectedStyleId`, `selectedStyleIds`
- Credit service with wallet transaction logging (exists but booking actions use simpler subscription-store path)
- Entitlement matching via `getValidEntitlements`: checks status, remaining usage, class type, style access, level, and term binding
- Dev tools: assign/remove/reset entitlements

### Classes / Schedule
- Class templates (recurring weekly definitions) with admin CRUD at `/classes`
- Bookable class instances (date-specific) with admin management at `/classes/bookable`
- Instance generation from templates for a date range
- 8 dance styles including Bachata, Cuban, Salsa Line, Reggaeton, with role-balance flags
- Teacher roster, pair assignments, pair presets at `/classes/teachers`

### Admin Bookings
- Full admin booking creation with validations: student/class/subscription/term/beginner-entry checks
- Admin cancel (normal + late), restore, check-in, promote from waitlist, remove from waitlist
- Booking detail panel with quick links to Attendance, Penalties, Student, Schedule, Waitlist
- Route: `/bookings` (admin view)

### Student Booking Experience
- Class browser at `/classes` with full bookability engine (10-step pipeline):
  1. Class status, 2. Class type, 3. Already-booked, 4. Already-waitlisted, 5. Restore-available, 6. Term validity, 7. Beginner restriction, 8. Entitlement filtering, 9. Capacity + role-balance, 10. Result
- Booking creates a `checkInToken` for QR-ready check-in
- My Bookings at `/bookings` with upcoming, waitlisted, past/cancelled sections
- Student dashboard at `/dashboard` with entitlement summary, upcoming classes, penalty summary

### Waitlist
- Automatic waitlisting when class is full or role-balanced
- FIFO promotion when a spot opens (cancel triggers promotion)
- Role-aware promotion for partner classes
- Position reindexing on changes
- Student can leave waitlist via action
- Admin can manually promote or remove entries

### Cancellation / Restore
- Student cancellation guards: blocked after class start, late-cancel warning within cutoff
- Credit restoration on cancel: `remainingCredits++` for passes, `classesUsed--` for memberships
- Late-cancel penalty creation when enabled
- Reversible cancellation: student can restore before class start if spot available
- Restore re-consumes entitlement and regenerates check-in token
- Duplicate prevention: same student+class cannot have two active bookings

### Code of Conduct
- Versioned CoC content (v1.0, 7 sections) in `config/code-of-conduct.ts`
- In-memory acceptance store with globalThis (tracks `studentId`, `acceptedVersion`, `acceptedAt`)
- Pre-seeded: 3 students have accepted
- Student acceptance flow: `CocAcceptanceDialog` with scrollable text + checkbox
- `CocReadOnlyDialog` for re-reading
- Dashboard shows CTA banner when not accepted
- Class cards show acceptance CTA when booking is blocked by CoC
- Server-side enforcement: `createStudentBooking` rejects if CoC not accepted

### QR / Token Check-in
- Per-booking `checkInToken` (32-char hex, timestamp + random)
- Token generation on booking creation and on restore
- `CheckInQrDialog` renders QR code via `qrcode.react` with copy-to-clipboard
- Student can view QR from My Bookings for upcoming confirmed classes
- Token validation action: `validateTokenCheckInAction`
- Admin/staff token entry panel on Attendance page

### Self Check-in
- Student self-check-in action: `studentSelfCheckInAction`
- Eligibility rules: booking must be confirmed, within time window, belongs to student
- Configurable: `selfCheckInEnabled`, `selfCheckInOpensMinutesBefore` (default 15)
- Read-only eligibility check available for UI

### Admin / Staff Check-in
- Manual check-in via attendance page or booking detail
- Staff/admin token check-in has NO opening-window restriction (operational override)
- Only blocked after attendance closure window
- Creates attendance record with method metadata (`manual`, `qr`, `self`)
- `markedBy` field distinguishes Staff vs QR Scanner

### Attendance Closure Rules
- Configurable `attendanceClosureMinutes` (default 60)
- `runAttendanceClosure()` runs on page load for Dashboard and Attendance
- Scans all past-closure-window instances
- Confirmed bookings without attendance → marked `missed`
- Checked-in bookings are protected (never become missed)
- Closure function is render-safe (no `revalidatePath` during render)

### Attendance Correction Behavior
- `markStudentAttendance` acts as a state machine:
  - **present/late** → booking becomes `checked_in`, credit consumed
  - **absent/excused** → booking reverts to `confirmed`, credit restored
- Changing attendance reverses previous side effects and applies new ones
- Penalty lifecycle: absent creates no-show penalty (if enabled), correcting to present/late marks penalty as `attendance_corrected`
- `attendance_corrected` penalties are hidden from student-facing UI

### Student-Visible Status
- `resolveStudentVisibleStatus(bookingStatus, attendanceMark)` overlays attendance on booking status
- Dashboard and Bookings pages use this for student displays
- Mapping: present→checked_in, late→late, absent→absent, excused→excused
- Falls back to raw booking status when no attendance mark exists

### Penalties
- Types: `late_cancel`, `no_show`
- Resolutions: `credit_deducted`, `monetary_pending`, `waived`, `attendance_corrected`
- Auto-assessment on late cancel and no-show (when enabled)
- Credit deduction priority: pass → drop_in → membership
- Admin CRUD: create manual, update resolution/notes, delete (dev), backfill (dev)
- Student view filters out `attendance_corrected` penalties
- Fee amounts configurable in settings
- Socials excluded from all penalty logic
- No-show penalties OFF by default

### Settings
- Full settings page at `/settings`
- Configurable: penalty fees, cutoff minutes, penalty toggles, role imbalance, class type bookability, waitlist expiry, attendance closure minutes, self-check-in, QR check-in
- File-backed in dev (`.data/settings.json`), synchronous reads for domain helpers

### Dev-Only Testing Tools
- **Role switcher**: toggle between admin/teacher/student via cookie
- **Student impersonation**: select any seeded student, student-facing pages reflect their data
- **Dev panel** (God Mode): compact panel with actions for:
  - Assign/remove/reset entitlements
  - Create/cancel bookings
  - Join/leave waitlist
  - Add/waive penalties
  - Toggle leader/follower role
  - Accept/revoke Code of Conduct
- All guarded behind `NODE_ENV === "development"`

---

## 3. Business Rules Currently Enforced

| Rule | Status |
|---|---|
| Terms are central — products and classes are term-scoped | Enforced |
| Memberships: classesPerTerm usage tracking | Enforced |
| Passes/drop-ins: remainingCredits tracking | Enforced |
| Beginner 1 classes restricted to term weeks 1–2 | Enforced |
| Student Practice: visible but not online-bookable, pay at reception | Enforced (configurable) |
| Socials: not bookable, no penalties, no credits | Enforced |
| No-show penalties OFF by default | Enforced |
| Late-cancel penalties: configurable, default €2 | Enforced |
| Student cancellation: only before class start | Enforced |
| Late-cancel warning: within cutoff window before start | Enforced |
| Restore: only before class start, only if spot available | Enforced |
| Duplicate booking prevention: one active booking per student+class | Enforced |
| Restore-available: blocked class cards show Restore instead of Book | Enforced |
| Waitlist: auto when full or role-balanced, FIFO promotion, role-aware | Enforced |
| Code of Conduct: required before booking, versioned, tracked | Enforced |
| Self-check-in: time-limited, configurable window | Enforced |
| Admin/staff check-in: operational override, no opening-window limit | Enforced |
| Attendance closure: +60min (configurable) after class start | Enforced |
| Unchecked confirmed bookings become missed after closure | Enforced |
| Checked-in bookings never become missed | Enforced |
| present/late attendance → credit consumed | Enforced |
| absent/excused attendance → credit restored | Enforced |
| Attendance correction reverses previous side effects | Enforced |
| Attendance-corrected penalties hidden from students | Enforced |
| Role balance: per-role caps, configurable imbalance limit | Enforced |
| Credit deduction priority: pass → drop_in → membership | Enforced |

---

## 4. Current User Flows

### New Student Usage Flow
1. Admin creates student record
2. Admin assigns entitlement (membership/pass/drop-in)
3. Student is impersonated via dev tools (no real auth)
4. Student accepts Code of Conduct
5. Student browses available classes → bookability computed per class
6. Student books a class → credit consumed, check-in token generated
7. Student views QR code from My Bookings

### Admin Assigns Entitlement
1. Navigate to `/students` or use dev tools
2. Select student → assign product with subscription params
3. Subscription appears immediately in dashboard/dev panel

### Student Accepts CoC
1. Dashboard shows CTA banner if not accepted
2. Class cards show "Accept Code of Conduct" if blocked
3. Click opens `CocAcceptanceDialog` → read sections → check agreement → accept
4. Booking immediately unlocked

### Student Books Class
1. Browse `/classes` → see available classes with bookability status
2. Select entitlement if multiple valid ones
3. Click Book → server validates everything (CoC, entitlement, capacity, duplicate, term, beginner)
4. Confirmed → credit consumed, token generated, dashboard updated
5. If full → auto-waitlisted with position

### Student Joins Waitlist
Automatic when class is full or role-balanced. Student sees position. Can leave anytime.

### Student Cancels / Restores
1. From My Bookings → Cancel button on future confirmed bookings
2. Late-cancel warning shown if within cutoff
3. Cancel → credit restored, waitlist promotion triggered
4. Restore button appears on cancelled bookings (before class start, spot available)
5. Restore → credit re-consumed, new token generated

### Student Shows QR
1. From My Bookings → QR button on upcoming confirmed bookings
2. Opens dialog with QR code + token text + copy button
3. Show to staff for check-in

### Staff/Admin Checks In
1. Attendance page → today's classes listed
2. Manual check-in button per student booking
3. Token entry panel at top → paste/type token → validate → check in
4. Admin check-in has no opening-window restriction

### Attendance Correction
1. Admin marks attendance: present/late/absent/excused
2. If changing from absent to present: credit consumed, no-show penalty marked `attendance_corrected`
3. If changing from present to absent: credit restored, no-show penalty may be created
4. Student UI immediately reflects new status

### Penalties Visibility
- Active penalties visible to students in dashboard and `/penalties`
- `attendance_corrected` penalties hidden from student views
- Admin sees full penalty history including corrected ones

---

## 5. Current Dev/Test Setup

### Role Switcher
Cookie-based (`dev_role`). Options: admin, teacher, student. Persists across refreshes. Available in sidebar or dev panel.

### Student Impersonation
Cookie-based (`dev_student_id`). Select any seeded student. All student-facing pages immediately reflect that student's data.

### Dev Panel ("God Mode")
Floating panel with sections for:
- Current student state (entitlements, bookings, waitlist, penalties, CoC status)
- Quick actions for all domain operations
- Uses standardized wording: "Used X / Y · Z left"

### Useful Seeded Students
| Student | Entitlements | Notes |
|---|---|---|
| Alice Murphy | Membership (8-class) + Pass (Beginner Latin Combo) | Good for testing multi-entitlement booking |
| Bob O'Brien | Membership (12-class Unlimited) | Good for testing high-usage membership |
| Ciara Flynn | Pass (Beginner Pack) | Good for testing pass consumption |
| Declan Walsh | Drop-in credits | Good for testing drop-in flow |
| Eimear Brennan | No entitlements | Good for testing blocked booking |

### Seeded Scenarios
- Multiple future bookable classes across styles/levels
- At least one class with existing bookings near capacity
- Waitlist entries for testing promotion
- Cancelled bookings for testing restore
- Attendance records for testing closure and corrections
- Penalties for testing visibility rules

### Testing Core Flows Quickly
1. Switch to student role → impersonate Alice
2. Accept CoC if needed
3. Book a class from `/classes`
4. View QR from `/bookings`
5. Switch to admin → check in via token on `/attendance`
6. Mark attendance correction → verify student UI updates

---

## 6. Known Limitations / Open Issues

### Architecture
- **In-memory only** — all data lost on server restart (globalThis survives HMR only)
- **No production auth** — Supabase auth is partially wired but not operational
- **No real payments** — Stripe is placeholder-ready only
- **No production database** — Supabase types exist but stores are mock-seeded
- **File-backed settings** — `.data/settings.json` is local-only

### Missing Features
- **No camera/device QR scanning** — token entry is manual, QR code is display-only
- **No email/SMS notifications** — no booking confirmation, no waitlist promotion alerts
- **No teacher portal** — teachers share admin routes
- **No events/workshops commercial model** — only classes, socials, student practice
- **No birthday-week or giveaway automation**
- **No refund flow** — cancellation restores credits but no monetary refunds
- **No student self-registration** — admin creates all students

### UX Rough Edges
- Wallet transaction history exists but is underused (credit-service vs subscription-store dual path)
- Latin Combo product mapping is PROVISIONAL
- Timezone handling assumes Dublin server time
- `StudentPractice` bookability is configurable but UI may not fully distinguish pay-at-reception flow
- Some badge colors may need tuning for accessibility

### Technical Debt
- `globalThis` pattern across all stores works for HMR but is not production-ready
- `lib/actions/cancellation.ts` appears to be a legacy version superseded by `lib/actions/booking-student.ts`
- Credit service and subscription store represent two parallel credit-tracking approaches
- Mock data file (`lib/mock-data.ts`) is large and growing

---

## 7. Recommended Next Phase

**Phase: Production Foundation**

The most impactful next phase is preparing the system for real deployment:

1. **Supabase persistence** — migrate in-memory stores to Supabase tables, keeping the same service interfaces
2. **Real authentication** — wire Supabase Auth with student self-registration and password recovery
3. **Student self-registration flow** — registration → CoC acceptance → profile completion
4. **Email notifications** — booking confirmation, waitlist promotion, cancellation receipt
5. **QR camera scanning** — add device camera integration for staff check-in

**Alternative next phase if staying in prototype mode:**
- Events/workshops commercial model
- Teacher-specific portal and schedule views
- Multi-term subscription management and renewal

---

## 8. Resume Instructions

### Environment Setup
```bash
cd /Users/lopezmalejandro/Desktop/BPM
npm install
npm run dev
```

### Key Files to Understand First
1. `lib/mock-data.ts` — all seed data
2. `lib/domain/bookability.ts` — central booking decision engine
3. `lib/services/booking-service.ts` — core booking/waitlist operations
4. `lib/actions/attendance.ts` — attendance state machine with credit/penalty side effects
5. `lib/services/settings-store.ts` — all configurable business rules

### Architecture Pattern
- **Domain** (`lib/domain/`): Pure functions, no framework imports
- **Services** (`lib/services/`): Store wrappers with CRUD + business methods
- **Actions** (`lib/actions/`): Server actions that orchestrate domain + service calls
- **Pages** (`app/(app)/`): Server components that fetch data and render client components
- **Components**: Client components with `useTransition` for mutations

### Testing in Dev
1. `npm run dev` → open `http://localhost:3000`
2. Use role switcher (sidebar) to toggle admin/student
3. Use student selector to impersonate seeded students
4. Use dev panel (God Mode) for quick state manipulation
5. Bookings, entitlements, attendance, and penalties are all live and interconnected

### Previous Checkpoint
- Commit `29ae121`: terms, products, entitlements, student booking flow, waitlist, cancel/restore, attendance closure, dev tools
- This checkpoint adds: CoC acceptance, QR/token check-in, self-check-in, attendance corrections, credit restoration rules, student-visible-status overlay
