# Tech Debt

Tracked items for the BPM Booking System MVP. Each entry describes what
needs attention, why it exists, and a rough priority.

---

## Data Layer

### TD-01: Replace in-memory mock stores with Supabase
**Priority: High (next milestone)**

All services (`BookingService`, `PenaltyService`, `AttendanceService`,
`CreditService`) use in-memory arrays. Singleton store modules
(`*-store.ts`) wrap these with mock data. The `generateId()` helper
produces prefixed IDs (`b-…`, `pen-…`); Supabase will use UUIDs.

**Files:** `lib/services/*-store.ts`, `lib/mock-data.ts`, `lib/utils.ts`

### TD-02: Zod schemas use UUID validation; mock IDs are not UUIDs
**Priority: Medium**

`types/schemas.ts` defines `cancelBookingSchema`, `createBookingSchema`,
etc. with `.uuid()` constraints. Mock data uses short prefixed IDs
(e.g. `"b-01"`). The schemas are not currently enforced in all server
actions. When Supabase is connected and real UUIDs are used, wire up
schema validation in every action.

**Files:** `types/schemas.ts`, `lib/actions/*.ts`

### TD-03: Student identification uses name matching
**Priority: Medium**

`StudentBookings` component matches bookings by `user.fullName`, and
the booking action generates synthetic student IDs from the name.
Replace with `user.id` once Supabase Auth is wired up.

**Files:** `components/booking/student-bookings.tsx`, `lib/actions/booking.ts`

### TD-04: Currency is hardcoded to EUR
**Priority: Low**

`formatCents()` hardcodes `€`. The `Penalty` and `Product` domain
types include a `currency` field, but it is not used for formatting.
When multi-currency support is needed, make `formatCents` currency-aware.

**Files:** `lib/utils.ts`, `lib/domain/penalty-rules.ts`

---

## Domain Logic

### TD-05: Penalty assessment passes empty subscriptions array
**Priority: Medium**

Both `cancellation.ts` and `attendance.ts` server actions pass
`subscriptions: []` to the penalty service because they don't fetch
the student's active subscriptions from the credit service. This means
credit-deduction resolution always falls through to `monetary_pending`.
Wire up `CreditService.getActiveSubscriptionsForStudent()`.

**Files:** `lib/actions/cancellation.ts`, `lib/actions/attendance.ts`

### TD-06: No duplicate penalty guard
**Priority: Medium**

If attendance is toggled from present → absent → present → absent, a
new no-show penalty is created each time. Add an idempotency check:
skip penalty creation if one already exists for the same
(student, bookableClass, reason) tuple.

**Files:** `lib/services/penalty-service.ts`, `lib/actions/attendance.ts`

### TD-07: Waitlist offer expiry is defined but not enforced
**Priority: Low**

`WAITLIST_OFFER_EXPIRY_HOURS` exists in `config/business-rules.ts`
but no background job or cron checks for expired offers. Implement
when real-time notifications are added.

**Files:** `config/business-rules.ts`, `lib/domain/waitlist-rules.ts`

---

## UI

### TD-08: Dashboard uses a hardcoded "today" date
**Priority: Low (mock data)**

`MOCK_TODAY = "2026-03-17"` is used in both the dashboard and
attendance pages. Replace with `new Date()` when connected to live data.

**Files:** `app/(app)/dashboard/page.tsx`, `app/(app)/attendance/page.tsx`

### TD-09: QR check-in stubbed but not implemented
**Priority: Low (Phase 2)**

`CheckInMethod` type includes `"qr"` and TODO markers exist in
`attendance-service.ts`, `lib/actions/attendance.ts`, and
`lib/mock-data.ts`. Implement QR scanner UI and pass
`checkInMethod: "qr"` when ready.

**Files:** `types/domain.ts`, `lib/services/attendance-service.ts`

### TD-10: No pagination on admin tables
**Priority: Low**

All admin list pages render the full dataset. Add server-side
pagination when datasets grow beyond ~100 rows.

**Files:** `components/ui/admin-table.tsx`, all `page.tsx` files

---

## Testing

### TD-11: No integration tests for server actions
**Priority: Medium**

Unit tests cover domain logic and service classes. Server actions
(`lib/actions/*.ts`) are not tested. Add integration tests that
exercise the full action → service → domain chain.

### TD-12: No test for booking-store ↔ DANCE_STYLES role balance wiring
**Priority: Low**

`booking-store.ts` builds `danceStyleRequiresBalance` by looking up
the mock `DANCE_STYLES` array by name. This wiring is untested.

---

## Infrastructure

### TD-13: RLS policies exist but are never exercised
**Priority: High (pre-launch)**

`supabase/migrations/00007_rls_policies.sql` defines row-level
security. Currently bypassed because the app uses mock data. Must be
tested before any real user data is stored.

### TD-14: Stripe integration is a placeholder
**Priority: High (pre-launch)**

`Product.stripePriceId` and `StudentSubscription.stripeSubscriptionId`
exist in the schema but are never read or written. Implement when
payment flow is built.
