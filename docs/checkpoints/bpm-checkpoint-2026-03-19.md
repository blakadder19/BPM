# BPM Project Checkpoint — 2026-03-19

## A. Project Snapshot

**What BPM is:** A lightweight booking system for Balance Power Motion, a social dance academy in Dublin. Students book dance classes, join waitlists, manage cancellations. Admins manage terms, products, student entitlements, attendance, and penalties.

**Prototype status:** Functional MVP prototype. All core booking flows work end-to-end. No real database, auth, or payments — everything runs in-memory with mock data.

**Architecture:**
- Next.js 15 App Router with TypeScript
- Tailwind CSS for styling
- In-memory stores seeded from `lib/mock-data.ts`
- Server actions for all mutations
- Pure domain functions for business rules
- Zod for server-side validation (schemas in `types/schemas.ts`)
- No Supabase connection yet (placeholder only)
- No Stripe integration (placeholder only)

**Environment assumptions:**
- Local dev only (`npm run dev`)
- All data resets on full server restart
- Critical stores (booking, subscription, penalty, attendance) use `globalThis` to survive HMR
- Non-critical stores (term, product, student, schedule, teacher) use module-level `let` (reset on HMR)
- Settings stored on disk (`.data/settings.json`)
- Dev-only impersonation via cookies (`dev_role`, `dev_student_id`)

---

## B. What Is Implemented

### Terms
- **Route:** `/terms` (admin only)
- **Store:** `lib/services/term-store.ts` (module-level `let`)
- **Domain:** `lib/domain/term-rules.ts` — `getCurrentTerm`, `findTermForDate`, `getTermWeekNumber`, `isBeginnerEntryWeek`, `isBeginnerEntryClass`
- **Actions:** `createTermAction`, `updateTermAction`
- **UI:** Admin table with add/edit dialogs. Columns: name, start/end dates, status, week number
- **Seed:** 2 terms — Spring 2026 (active, Mar 9 – Apr 5), Summer 2026 (upcoming, Apr 6 – May 3)
- **Note:** 4-week terms assumed. Beginner intake restricted to weeks 1–2

### Products
- **Route:** `/products` (admin only)
- **Store:** `lib/services/product-store.ts` (module-level `let`)
- **Service:** `lib/services/product-service.ts` (async wrapper, stubs for production)
- **Access rules:** `config/product-access.ts` — 12 rules mapping products to allowed class types, styles, levels
- **Actions:** `createProductAction`, `updateProductAction`, `toggleProductActiveAction`
- **UI:** Admin table with expandable detail panels, add/edit/deactivate dialogs, search + filters (type, active, provisional)
- **Seed:** 12 products:
  - 4 memberships (4/8/12/16 classes per term, EUR 45–95)
  - 3 passes — Bronze/Silver/Gold (4/8/12 credits, EUR 30–70)
  - 1 drop-in (1 credit, EUR 12)
  - 1 Beginners 1&2 Promo Pass (16 credits, EUR 25)
  - 1 Beginners Latin Combo (16 credits, EUR 35, PROVISIONAL)
  - 1 Social Pass (4 credits, EUR 20)

### Students / Entitlements
- **Route:** `/students` (admin only)
- **Subscription store:** `lib/services/subscription-store.ts` (uses `globalThis` — HMR-safe)
- **Domain:** `lib/domain/entitlement-rules.ts` — validates subscriptions against class context, checks style/level/term/usage
- **Entitlement model:**
  - **Memberships:** counter-based (`classesUsed` / `classesPerTerm`), term-bound, recurring
  - **Passes:** credit-based (`remainingCredits` / `totalCredits`), style-restricted, term-bound
  - **Drop-ins:** single-use credit, not term-bound, all styles
- **Seed:** 8 students (all active), 7 subscriptions (student s-05 Eve has none)
- **UI:** Admin students table with detail panels showing student info + entitlements. Add/edit student and subscription dialogs

### Classes / Schedule
- **Route:** `/classes` (admin for templates, student for browsing)
- **Schedule store:** `lib/services/schedule-store.ts` (module-level `let`)
- **Class store:** `lib/services/class-store.ts` (templates, module-level `let`)
- **Admin UI:** Template management (create/edit class templates), teacher assignment
- **Student UI:** Class browser with search, style/level filters, date-grouped cards
- **Seed:** 17 bookable class instances across multiple dates, styles, levels
- **Class types:** `"class"` (bookable), `"social"` (not online-bookable), `"student_practice"` (pay at reception)

### Admin Bookings
- **Route:** `/bookings` (admin view)
- **Actions:** `adminCreateBookingAction`, `adminCancelBookingAction`, `adminCheckInBookingAction`, `adminPromoteWaitlistAction`, `adminRemoveFromWaitlistAction`, `adminRestoreBookingAction`, `checkLateCancelStatusAction`
- **UI:** Full table with expand/collapse detail panels, search, status/role/class filters, quick-link navigation to attendance/penalties/student
- **Features:** Force-confirm (bypass capacity), late-cancel detection, penalty creation, waitlist promotion, credit refund on cancel, credit re-deduction on restore

### Student Booking Experience
- **Routes:** `/classes` (browse + book), `/bookings` (my bookings)
- **Bookability engine:** `lib/domain/bookability.ts` — `computeBookability()` returns one of 7 states:
  - `bookable` — show Book CTA with entitlement selection
  - `waitlistable` — show Join Waitlist CTA
  - `already_booked` — show "You're booked" badge
  - `already_waitlisted` — show position badge
  - `restore_available` — show "Cancelled — can be restored" with Restore CTA
  - `blocked` — show reason text (no entitlement, beginner intake closed, etc.)
  - `not_bookable` — show reason text (pay at reception, not online-bookable)
- **Booking action:** `createStudentBooking` — 3-layer duplicate prevention (bookability engine + action + service)
- **Class card UI:** Color-coded cards (blue=booked, amber=waitlisted, orange=restorable, gray=blocked)
- **Booking dialog:** Entitlement selector (radio buttons), role selector for partner classes, beginner warnings

### Waitlist
- **Domain:** `lib/domain/booking-rules.ts` (capacity/role-balance), `lib/domain/waitlist-rules.ts` (promotion candidate selection, reindex)
- **Service:** Integrated into `BookingService` — `bookClass` auto-waitlists, `cancelBooking/cancelBookingAsAdmin` auto-promotes
- **Student self-service:** Leave waitlist via `studentLeaveWaitlistAction`
- **Admin tools:** Manual promote, manual remove
- **Promotion rules:** Role-aware for partner classes (promotes matching freed role first)

### Cancellation / Restore
- **Student cancel guards:**
  1. Must be authenticated as student
  2. Must own the booking
  3. Booking must be `"confirmed"` (not checked_in, not already cancelled)
  4. Class must not have started (`hasStarted` check)
- **Late cancel:** Within 60 min of class start → `"late_cancelled"` status + penalty (if enabled)
- **Regular cancel:** More than 60 min before → `"cancelled"` status, no penalty
- **Credit restoration:** Always restored on cancel (membership: `classesUsed - 1`, pass: `remainingCredits + 1`)
- **Student restore guards:** Same ownership/auth + booking must be `cancelled`/`late_cancelled` + class not started
- **Restore logic:** `restoreBooking()` checks capacity → confirmed if spot available, otherwise added to waitlist
- **Credit re-deduction:** Only on confirmed restore (not waitlisted)
- **Duplicate prevention:** `restore_available` state prevents creating a second booking when a restorable cancelled one exists

### Attendance / Missed Logic
- **Route:** `/attendance` (admin/teacher only)
- **Service:** `AttendanceService` with `markAttendance`, `getAttendanceForClass`, `getSummary`
- **Marks:** `"present"` | `"absent"` | `"late"` | `"excused"`
- **Check-in:** Marking present/late auto-transitions booking to `"checked_in"`
- **Closure:** `closeAttendanceForPastClasses()` runs on `/attendance` and `/dashboard` page loads
  - After class start + 60 min: unchecked confirmed bookings → `"missed"` status
  - No penalty created during closure (no-show is OFF by default)
  - Idempotent — safe to call multiple times
- **Absent → penalty:** When attendance marked as `"absent"`, creates no-show penalty (if `noShowPenaltiesEnabled`)
- **Reconciliation:** If attendance record exists as present/late but booking is still "confirmed", closure auto-checks-in

### Penalties
- **Route:** `/penalties` (admin + student views)
- **Types:** `"late_cancel"` (EUR 2.00), `"no_show"` (EUR 5.00)
- **Resolutions:** `"credit_deducted"` | `"monetary_pending"` | `"waived"`
- **Default state:** Late-cancel penalties ON, no-show penalties OFF
- **Auto-waive:** When attendance changes from absent to any other status, pending no-show penalty is auto-waived
- **Student view:** Read-only list of own penalties with status badges

### Settings
- **Route:** `/settings` (admin only)
- **Storage:** Disk-backed (`.data/settings.json`)
- **Configurable:** Late-cancel fee, no-show fee, cutoff minutes, penalty toggles, role imbalance limit, role-balanced styles, class-type bookability, waitlist offer expiry, provisional notes

### Dev-Only Testing Tools
- **Student impersonation:** Topbar dropdown to impersonate any seeded student (sets `dev_student_id` cookie)
- **Role switcher:** Topbar dropdown to switch between admin/teacher/student
- **Dev panel:** Floating pink-bordered panel (bottom-right) with god-mode actions:
  - Toggle preferred role (leader/follower)
  - Assign/remove/reset entitlements
  - Add/cancel bookings
  - Join/leave waitlist
  - Add/waive penalties
- **Guard:** All dev actions protected by `guardDev()` — throws in production

---

## C. Business Rules Currently Enforced

### Terms & Scheduling
- Terms are 4-week periods with status: draft, active, upcoming, past
- Memberships are term-bound — subscription term must match class term
- Beginner 1 classes restricted to weeks 1–2 of the term (intake window)

### Products & Entitlements
- Memberships: counter-based usage (classesUsed / classesPerTerm), term-bound, auto-renew flag
- Passes: credit-based (remainingCredits / totalCredits), style-restricted via access rules
- Drop-ins: single-use (1 credit), not term-bound, all styles/levels
- Beginners Latin Combo: PROVISIONAL — pick 2 of 3 styles (Bachata, Cuban, Salsa Line)
- Social Pass: restricted to social class type only

### Booking Rules
- Only `"class"` type is online-bookable
- Socials: not online-bookable (controlled by `settings.socialsBookable`)
- Student Practice: not bookable, shows "Pay at reception"
- Duplicate booking prevention: cannot create second booking for same student + class instance
- Cancelled booking: shows "restore_available" instead of allowing new booking
- Role balance enforced for partner dance styles (configurable list)
- Allowed role imbalance: 2 (configurable)

### Cancellation Rules
- Cancel allowed only before class start
- More than 60 min before: free cancel, full credit/usage refund
- Within 60 min (late cancel): allowed with warning, penalty fee if `lateCancelPenaltiesEnabled`
- After class start: cancel blocked
- Credit always restored on cancel regardless of late/regular

### Attendance Rules
- Check-in open from class start until +60 min after start
- After +60 min: unchecked confirmed bookings transition to `"missed"` (not cancelled)
- No penalty created for missed by default (no-show OFF)
- Marking absent explicitly → no-show penalty (if enabled)
- Marking present/late → auto-transitions booking to checked_in

### Penalty Rules
- Late cancel fee: EUR 2.00 (default, configurable)
- No-show fee: EUR 5.00 (default, configurable)
- Late-cancel penalties: ON by default
- No-show penalties: OFF by default
- Socials: excluded from all penalties
- Student Practice: excluded from penalties
- Resolution: credit_deducted (if matching subscription found), monetary_pending (fee owed), waived

### Restore Rules
- Only cancelled/late_cancelled bookings can be restored
- Must be before class start
- Capacity/role-balance checked via `restoreBooking()` → confirmed if spot available, waitlisted if full
- Credit re-deducted only on confirmed restore
- Restore available from both My Bookings page and Classes page

---

## D. Current User Flows

### Admin assigns entitlement
1. Admin opens `/students` → expands student → clicks "Add Subscription"
2. Selects product, term, payment method → submits
3. Subscription created in store, student detail panel updates

### Student books a class
1. Student opens `/classes` → sees class cards with bookability state
2. Clicks "Book" on a bookable card → dialog opens with entitlement selector
3. Selects entitlement (auto-selected if only one), optionally selects role
4. Submits → `createStudentBooking` validates, deducts credit, creates booking
5. Success confirmation in dialog → `/bookings`, `/classes`, `/dashboard` revalidated
6. Dashboard entitlement counts update immediately

### Student joins waitlist
1. Same as booking flow but class is full → card shows "Join Waitlist"
2. Clicks → same dialog but with waitlist badge
3. Submits → added to waitlist at next position, no credit deducted
4. When a spot opens (another student cancels): auto-promoted to confirmed booking

### Student cancels booking
1. Student opens `/bookings` → sees upcoming booking with "Cancel" button
2. Clicks Cancel → dialog opens, checks late-cancel status
3. If > 60 min before: "No penalty will apply" message
4. If < 60 min: late-cancel warning with fee amount
5. If class started: blocked with "Class has already started" message
6. Confirms → booking cancelled, credit restored, penalty created if late + enabled

### Student restores cancelled booking
1. From `/bookings` "Recently Cancelled" section → clicks "Restore"
2. Or from `/classes` card showing "Cancelled — can be restored" → clicks "Restore Booking"
3. Dialog checks eligibility (class not started, booking is cancelled)
4. Confirms → `restoreBooking()` checks capacity → confirmed or waitlisted
5. If confirmed: credit re-deducted. If waitlisted: no credit consumed

### Admin checks attendance
1. Admin/teacher opens `/attendance` → sees today's classes with student lists
2. Closure auto-runs: past classes' unchecked bookings become "missed"
3. Marks students as present/late/absent/excused
4. Present/late → booking transitions to checked_in
5. Absent → no-show penalty created (if enabled)

### Dashboard entitlement updates
1. After any booking/cancel/restore action → `revalidatePath("/dashboard")`
2. Dashboard RSC re-runs → reads subscription store (globalThis-backed)
3. `classesUsed` / `remainingCredits` reflect the latest mutations

---

## E. Current Dev/Test Setup

### How to run
```bash
npm run dev
```
Opens at `http://localhost:3000`. Starts in admin mode by default.

### Role switcher
- Topbar has a yellow-bordered dropdown: Admin / Teacher / Student
- Switch to "Student" to see the student experience
- Admin/Teacher see admin-facing pages

### Student impersonation
- When in Student role, a pink-bordered dropdown appears next to role switcher
- Lists all 8 seeded students
- Select any student → all student pages reflect that student's data
- No password needed

### Dev panel (god mode)
- When impersonating a student, a floating pink panel appears at bottom-right
- Click "DEV" to expand
- Quick actions to modify entitlements, bookings, penalties for the impersonated student
- Useful for testing edge cases without navigating through the full UI

### Seeded students worth testing

| Student | Subscription | Good for testing |
|---|---|---|
| Alice Murphy (s-01) | 12 Classes Membership (3/12 used) | Standard booking flow, plenty of classes left |
| Bob O'Brien (s-02) | 8 Classes Membership (2/8 used) | Leader role, medium usage |
| Carol Walsh (s-03) | Beginners 1&2 Pass (12/16 credits) | Beginner restriction testing, style-restricted pass |
| Dave Keane (s-04) | 4 Classes Membership (1/4 used) | Low-capacity membership, nearly full testing |
| Eve Byrne (s-05) | No subscription | "No valid entitlement" blocked state |
| Finn Doyle (s-06) | 16 Classes Membership (4/16 used) | High-capacity membership |
| Grace Kelly (s-07) | Beginners Latin Combo (3/16 credits, PROVISIONAL) | Course-group style matching |
| Hugo Brennan (s-08) | Drop-in (1 credit) | Single-use testing, runs out after 1 booking |

### Useful test scenarios
1. **Book + cancel + restore:** Impersonate Alice → book a class → cancel → see in "Recently Cancelled" → restore
2. **Entitlement exhaustion:** Use Dev Panel to reset Hugo's drop-in → book once → try to book again (should be blocked)
3. **Waitlist flow:** Book until a class is full → switch to another student → try to book (waitlist) → go back → cancel → check promotion
4. **Late cancel:** Use a class starting within 60 min → attempt cancel → see late warning
5. **Beginner restriction:** Impersonate Carol → try booking a Beginner 1 class in week 3+ → should be blocked
6. **No entitlement:** Impersonate Eve → try booking → should see "No valid entitlement"
7. **Restore from classes page:** Cancel a booking → go to /classes → see orange card → click "Restore Booking"

---

## F. Known Limitations / Open Issues

### Architecture / Persistence
- **In-memory only:** All data resets on full server restart. No database.
- **HMR inconsistency:** Critical stores (booking, subscription, penalty, attendance) use `globalThis`; non-critical stores (term, product, student, schedule, teacher) use module-level `let` and reset on HMR. This causes no user-visible bugs currently but is inconsistent.
- **Settings on disk:** Settings use `.data/settings.json` — survives restart but not portable.
- **No real auth:** Dev-only cookie-based role switching. No Supabase auth connected.
- **No real payments:** Stripe is placeholder-only. No payment flow.

### Data / Model
- **Student denormalization:** `subscriptionName` and `remainingCredits` on MockStudent are stale display shortcuts, not synced with subscription store.
- **MockProduct vs Product type gap:** MockProduct has extra fields (`termBound`, `recurring`, `classesPerTerm`, `autoRenew`, `benefits`) not in the canonical Product type. Needs reconciliation before DB migration.
- **MockSubscription vs StudentSubscription type gap:** MockSubscription has extra fields (`productName`, `productType`, `selectedStyleId/Name/Ids/Names`, `classesUsed`, `classesPerTerm`, `paymentMethod`, `autoRenew`, `termId`). Significant schema gap.
- **Course-group style matching:** The `course_group` branch in `entitlement-rules.ts` has an incomplete fallback — returns `false` when `selectedStyleNames` is empty.

### Booking / Waitlist
- **Waitlist promotion doesn't deduct credits:** When a student is auto-promoted from waitlist, the new booking has `subscriptionId: null`. No credit is consumed. This means promoted students get a free class.
- **Admin bookings allow duplicates over cancelled:** `adminBook` doesn't check for existing cancelled bookings (student path does).
- **No-show penalties pass empty subscriptions:** `markStudentAttendance` passes `subscriptions: []` to `assessNoShowPenalty`, so credit-deduction resolution never works for no-shows.
- **Admin dashboard uses hardcoded MOCK_TODAY:** `components/dashboard/admin-dashboard.tsx` has `MOCK_TODAY = "2026-03-17"` instead of live date.

### UX
- **No QR check-in:** Only manual check-in implemented. QR is a placeholder type.
- **No email notifications:** No booking confirmation, waitlist promotion, or penalty notification emails.
- **No payment collection:** Monetary penalties are tracked but not collectible.
- **Attendance page reads from static BOOKABLE_CLASSES seed:** For today-filter purposes. Runtime-added class instances won't appear.

---

## G. Recommended Next Phase

**Phase 3: Waitlist Credit Deduction + Data Consistency Hardening**

Priority fixes before adding new features:
1. **Waitlist promotion credit deduction** — when auto-promoted, link to the student's subscription and deduct credit
2. **Migrate remaining stores to globalThis** — term, product, student, schedule, teacher stores
3. **Fix admin dashboard MOCK_TODAY** — use live date like student dashboard
4. **Fix no-show penalty subscription lookup** — pass actual student subscriptions instead of empty array
5. **Fix course_group style matching fallback** — complete the Latin Combo logic
6. **Reconcile Mock types with canonical types** — prepare for DB migration

After hardening:
- **Phase 4: Supabase Integration** — real database, real auth, data persistence
- **Phase 5: Payment Integration** — Stripe for subscriptions, penalty collection

---

## H. Resume Instructions

### Quick start
```bash
cd /Users/lopezmalejandro/Desktop/BPM
npm run dev
# Open http://localhost:3000
```

### How to understand the codebase
1. Start with `lib/mock-data.ts` — all seed data lives here
2. Read `types/domain.ts` — all domain types
3. Read `lib/domain/` — pure business rule functions
4. Read `lib/services/` — in-memory stores and service classes
5. Read `lib/actions/` — server actions (API layer)
6. Read `app/(app)/` — routes and server components
7. Read `components/` — UI components grouped by module

### Key architectural patterns
- **Server actions** for all mutations — never mutate from client directly
- **Pure domain functions** for business rules — no store access, all data passed as arguments
- **Bookability engine** (`computeBookability`) is the central authority for what a student can do with a class
- **Singleton stores** on `globalThis` for data that must survive HMR
- **`revalidatePath`** after every mutation to trigger server component re-renders

### Where to find things
| What | Where |
|---|---|
| Seed data (students, products, classes, bookings) | `lib/mock-data.ts` |
| Business rule constants | `config/business-rules.ts` |
| Product access rules | `config/product-access.ts` |
| Bookability engine | `lib/domain/bookability.ts` |
| Booking service (core) | `lib/services/booking-service.ts` |
| Student booking action | `lib/actions/booking.ts` |
| Student cancel/restore actions | `lib/actions/booking-student.ts` |
| Admin booking actions | `lib/actions/bookings-admin.ts` |
| Attendance closure | `lib/actions/attendance.ts` |
| Cancellation rules | `lib/domain/cancellation-rules.ts` |
| Datetime utilities | `lib/domain/datetime.ts` |
| Dev tools (god mode) | `lib/actions/dev-tools.ts` |
| Dev panel UI | `components/dev/dev-panel.tsx` |
| Settings | `lib/services/settings-store.ts` |

### Conversation history
Prior implementation work is documented in the agent transcript: `64101b49-939e-40ba-9db7-cf6b39fac98c`. Search by module name or filename for context on design decisions.
