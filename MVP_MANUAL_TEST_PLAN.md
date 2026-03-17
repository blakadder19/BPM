# BPM Booking System — MVP Manual Test Plan

> **Date:** 2026-03-17
> **Stack:** Next.js 16 + Supabase Auth (cloud) + in-memory stores (mock data)
> **Environment:** `npm run dev` on localhost:3000
> **Auth note:** Server-side Supabase calls may fail (EPERM). Login is client-side,
> session is local JWT, profile falls back to `role: "admin"`.
> All service data is **in-memory** — resets on server restart.

---

## Priority Order

Test sections are ordered by risk. A failure in a higher-priority section
blocks the ones below it.

| Priority | Section | Why |
|----------|---------|-----|
| P0 | Auth | Everything depends on login/logout working |
| P0 | Navigation | Must be able to reach every page |
| P1 | Bookings (create) | Core booking flow, only write action with full UI |
| P1 | Attendance | Only other write action with full UI; triggers penalties |
| P2 | Role balance | Correctness of partner-class capacity logic |
| P2 | Waitlist | Triggered implicitly by booking at capacity |
| P3 | Cancellations | Action exists but **no cancel button in UI yet** |
| P3 | Penalties | Created as side-effect of attendance/cancellation |
| P4 | Products / Subscriptions | Read-only display; validates config correctness |
| P4 | Classes (read) | Read-only display of templates and schedule |

---

## 1. Auth

### 1.1 Login with demo credentials

| | |
|---|---|
| **Objective** | Verify client-side Supabase login works end-to-end |
| **Steps** | 1. Open `http://localhost:3000/login` <br> 2. Click "Admin" demo button <br> 3. Verify email fills to `admin@bpm.dance`, password to `password123` <br> 4. Click "Sign In" |
| **Expected** | Redirects to `/dashboard`. Sidebar shows user info. No `fetch failed` errors in terminal. |
| **State change** | Browser sets `sb-*-auth-token` cookies. |

### 1.2 Login with wrong password

| | |
|---|---|
| **Objective** | Verify error is shown for bad credentials |
| **Steps** | 1. On `/login`, enter `admin@bpm.dance` / `wrongpass` <br> 2. Click "Sign In" |
| **Expected** | Red error banner appears ("Invalid login credentials" or similar). Page stays on `/login`. |
| **State change** | None. |

### 1.3 Logout

| | |
|---|---|
| **Objective** | Verify sign-out clears session and returns to login |
| **Steps** | 1. While logged in, click the logout icon (bottom-left of sidebar) <br> 2. Wait for redirect |
| **Expected** | Redirects to `/login`. Login form is visible. Navigating to `/dashboard` manually redirects back to `/login`. |
| **State change** | `sb-*-auth-token` cookies deleted. |

### 1.4 Protected route without session

| | |
|---|---|
| **Objective** | Verify middleware blocks unauthenticated access |
| **Steps** | 1. Clear all cookies (DevTools → Application → Cookies → delete all) <br> 2. Navigate to `http://localhost:3000/dashboard` |
| **Expected** | Redirects to `/login?next=%2Fdashboard`. |
| **State change** | None. |

### 1.5 Login redirect preserves `next` param

| | |
|---|---|
| **Objective** | After forced redirect to login, successful auth returns to original page |
| **Steps** | 1. Clear cookies <br> 2. Navigate to `/classes` → redirected to `/login?next=%2Fclasses` <br> 3. Log in with demo credentials |
| **Expected** | After login, lands on `/classes` (not `/dashboard`). |
| **State change** | Session established. |

---

## 2. Navigation

### 2.1 Sidebar links load every page

| | |
|---|---|
| **Objective** | Every nav link renders without crash |
| **Steps** | While logged in as admin, click each sidebar link in order: Dashboard, Classes, Bookings, Attendance, Students, Products, Penalties, Settings |
| **Expected** | Each page loads with data. No blank screens, no console errors, no redirect loops. |
| **State change** | None. |

### 2.2 Classes sub-tabs

| | |
|---|---|
| **Objective** | Classes page has working tab navigation |
| **Steps** | 1. Go to `/classes` <br> 2. Click "Schedule" tab <br> 3. Click "Teachers" tab <br> 4. Click "Templates" tab |
| **Expected** | Each tab renders its content. Templates = class list, Schedule = bookable instances, Teachers = teacher pairs. |
| **State change** | None. |

### 2.3 Dashboard drill-down links

| | |
|---|---|
| **Objective** | KPI cards link to correct detail pages |
| **Steps** | Click each KPI card on Dashboard: Today's Classes, Upcoming Bookings, Active Waitlists, Unresolved Penalties |
| **Expected** | Each navigates to the correct page (`/classes/bookable`, `/bookings`, `/classes/bookable`, `/penalties`). |
| **State change** | None. |

---

## 3. Bookings (Create)

### 3.1 Book a regular class — confirmed

| | |
|---|---|
| **Objective** | End-to-end booking of a class with available capacity |
| **Steps** | 1. Go to `/bookings/new` <br> 2. Select a class that has capacity (check `/classes/bookable` first) <br> 3. If the class requires a dance role, select Leader or Follower <br> 4. Fill: Full Name = `Test Student`, Email = `test@test.com`, Phone = `0851234567` <br> 5. Click "Book Class" |
| **Expected** | Success screen: "Booking Confirmed" with class name and date. "Book another class" link appears. |
| **State change** | `BookingService` in-memory: new booking with `status: confirmed`. `bookedCount` on the bookable class increments. If role-balanced, `leaderCount` or `followerCount` increments. |

### 3.2 Book a partner class — role required

| | |
|---|---|
| **Objective** | Role field is required for partner-style classes |
| **Steps** | 1. Go to `/bookings/new` <br> 2. Select a Bachata or Salsa class (partner style) <br> 3. Fill name/email/phone but do NOT select a dance role <br> 4. Click "Book Class" |
| **Expected** | Validation error: "Please select your dance role for this class." |
| **State change** | None. |

### 3.3 Book when class is at capacity — waitlisted

| | |
|---|---|
| **Objective** | Booking at capacity produces a waitlist entry |
| **Steps** | 1. Find a class near capacity on `/classes/bookable` <br> 2. Submit enough bookings (via `/bookings/new`) to fill it <br> 3. Submit one more booking |
| **Expected** | Success screen: "You're on the Waitlist" with position number. |
| **State change** | `WaitlistEntry` created with `status: waiting`. `waitlistCount` on the bookable class increments. |

### 3.4 Form validation — missing fields

| | |
|---|---|
| **Objective** | Zod validation catches empty required fields |
| **Steps** | 1. Go to `/bookings/new` <br> 2. Select a class <br> 3. Leave name, email, and phone blank <br> 4. Click "Book Class" |
| **Expected** | Field-level error messages appear under each required field. |
| **State change** | None. |

### 3.5 Book a non-bookable class type — rejected

| | |
|---|---|
| **Objective** | Social events and student practice cannot be booked |
| **Steps** | 1. Go to `/bookings/new` <br> 2. Check if the class dropdown includes any social or student practice entries <br> 3. If present, select one and attempt to book |
| **Expected** | The class selector should either exclude non-bookable types or the server action should return a rejection. Verify on `/classes/bookable` that social/student-practice entries show as non-bookable. |
| **State change** | None. |

---

## 4. Attendance

### 4.1 Mark student as present

| | |
|---|---|
| **Objective** | Marking "present" updates attendance and checks in the booking |
| **Steps** | 1. Go to `/attendance` <br> 2. In "Today's Classes" tab, find a class with booked students <br> 3. Click "Present" for a student |
| **Expected** | Button changes to indicate marked. Toast/feedback confirms the action. |
| **State change** | `AttendanceService`: new record with `status: present`. `BookingService`: booking status changes to `checked_in`. No penalty created. |

### 4.2 Mark student as absent — no-show penalty

| | |
|---|---|
| **Objective** | Marking "absent" creates a no-show penalty for regular classes |
| **Steps** | 1. Go to `/attendance` <br> 2. Click "Absent" for a student in a regular class (not social) |
| **Expected** | Feedback indicates penalty was created. |
| **State change** | `AttendanceService`: record with `status: absent`. `PenaltyService`: new penalty with `reason: no_show`, `amountCents: 500`, `resolution: monetary_pending` (no subscriptions passed). Visible on `/penalties`. |

### 4.3 Mark student as late

| | |
|---|---|
| **Objective** | "Late" updates attendance and checks in the booking (no penalty) |
| **Steps** | 1. Go to `/attendance` <br> 2. Click "Late" for a student |
| **Expected** | Attendance marked as late. Booking transitions to `checked_in`. No penalty created. |
| **State change** | `AttendanceService`: `status: late`. `BookingService`: `status: checked_in`. |

### 4.4 Mark student as excused

| | |
|---|---|
| **Objective** | "Excused" records attendance without penalty or check-in |
| **Steps** | 1. Go to `/attendance` <br> 2. Click "Excused" for a student |
| **Expected** | Attendance marked as excused. No penalty, no booking status change. |
| **State change** | `AttendanceService`: `status: excused`. |

### 4.5 Re-mark attendance (idempotent update)

| | |
|---|---|
| **Objective** | Changing a student's mark updates the existing record |
| **Steps** | 1. Mark a student as "Present" <br> 2. Then mark the same student as "Absent" |
| **Expected** | The attendance record is updated (not duplicated). Penalty may be assessed on the second mark. |
| **State change** | Single attendance record updated. |

### 4.6 History tab displays records

| | |
|---|---|
| **Objective** | The "History" tab shows past attendance records |
| **Steps** | 1. Go to `/attendance` <br> 2. Click the "History" tab |
| **Expected** | Table of historical attendance records from mock data, with search and filters working. |
| **State change** | None (read-only). |

---

## 5. Role Balance

### 5.1 Leader/Follower balance display on dashboard

| | |
|---|---|
| **Objective** | Dashboard shows accurate L/F balance for partner classes |
| **Steps** | 1. Go to `/dashboard` <br> 2. Find the "Leader / Follower Balance" card |
| **Expected** | Shows partner classes with bar chart of leader vs follower counts. Classes with ≤1 difference show "Balanced". |
| **State change** | None. |

### 5.2 Role cap enforcement

| | |
|---|---|
| **Objective** | Booking is waitlisted when a role's hard cap is reached |
| **Steps** | 1. Find a partner class on `/classes/bookable` with `leaderCap` and `followerCap` <br> 2. Book enough leaders to reach `leaderCap` <br> 3. Book one more leader |
| **Expected** | The extra leader booking is waitlisted, even if total capacity is not reached. |
| **State change** | Waitlist entry for the role-capped side. |

### 5.3 Imbalance limit enforcement

| | |
|---|---|
| **Objective** | Bookings are waitlisted when L/F imbalance exceeds `ALLOWED_ROLE_IMBALANCE` (2) |
| **Steps** | 1. Book 3 leaders with 0 followers in a partner class <br> 2. Attempt to book a 4th leader |
| **Expected** | 4th leader is waitlisted (imbalance would be 4 vs 0, exceeding limit of 2). |
| **State change** | Waitlist entry. |

---

## 6. Waitlist

### 6.1 Waitlist entry created on capacity overflow

| | |
|---|---|
| **Objective** | When a class is full, new bookings go to the waitlist |
| **Steps** | 1. Fill a class to capacity via repeated bookings <br> 2. Submit one more booking |
| **Expected** | Success screen says "You're on the Waitlist" with position = 1. |
| **State change** | Waitlist entry with `status: waiting`, `position: 1`. |

### 6.2 Waitlist entries visible on schedule page

| | |
|---|---|
| **Objective** | `/classes/bookable` shows waitlist count and details |
| **Steps** | 1. After creating a waitlist entry, go to `/classes/bookable` <br> 2. Find the class and expand the detail row |
| **Expected** | Waitlist count badge shows "1 WL" (or more). Expanding the row shows waitlisted students with their role and position. |
| **State change** | None (read-only). |

### 6.3 Waitlist promotion on cancellation

| | |
|---|---|
| **Objective** | When a booking is cancelled, the first matching waitlisted entry is promoted |
| **Steps** | (Cannot be fully tested via UI — cancel button is not wired.) <br> **Workaround:** Verified by automated tests in `lib/__tests__/booking-lifecycle.test.ts`. |
| **Expected** | After cancel, waitlisted entry moves to `promoted`, a new confirmed booking is created, and remaining positions are reindexed. |
| **State change** | N/A — requires cancel UI or API call. |

---

## 7. Cancellations

> **Status: Partially implemented.** The `cancelStudentBooking` server action is fully coded
> (`lib/actions/cancellation.ts`) but **no cancel button exists in the UI**.
> The `StudentBookings` component is read-only.

### 7.1 Cancel a confirmed booking (manual / API test)

| | |
|---|---|
| **Objective** | Verify the cancel action works end-to-end |
| **Steps** | Must invoke manually (e.g., browser console or a test script): <br> `fetch('/api/...', ...)` — but no API route is exposed either. <br> **Covered by automated tests:** `lib/__tests__/penalty-credit-flow.test.ts` |
| **Expected** | Booking status → `cancelled`. Late-cancel penalty assessed if within cutoff. Waitlist promotion triggered if applicable. |
| **State change** | Booking cancelled, optional penalty created, optional waitlist promotion. |

### 7.2 Late cancel penalty (within 60 min of class start)

| | |
|---|---|
| **Objective** | Cancelling within the cutoff window creates a penalty |
| **Steps** | Automated test coverage only. |
| **Expected** | Penalty: `reason: late_cancel`, `amountCents: 200`, `resolution: monetary_pending`. |

### 7.3 On-time cancel (no penalty)

| | |
|---|---|
| **Objective** | Cancelling well before class start creates no penalty |
| **Steps** | Automated test coverage only. |
| **Expected** | Cancellation succeeds, no penalty record. |

---

## 8. Penalties

### 8.1 Penalty list page displays records

| | |
|---|---|
| **Objective** | `/penalties` shows all penalties with correct data |
| **Steps** | 1. Go to `/penalties` <br> 2. Check the warning banner for unresolved count <br> 3. Verify table shows mock penalty data |
| **Expected** | 3 mock penalties visible. Filters (reason, resolution) work. Search by student name works. |
| **State change** | None (read-only). |

### 8.2 New penalty appears after marking absent

| | |
|---|---|
| **Objective** | Penalty from attendance marking (test 4.2) shows on the penalties page |
| **Steps** | 1. Complete test 4.2 (mark absent) <br> 2. Navigate to `/penalties` |
| **Expected** | A new penalty row appears for the student with `reason: no_show`, `resolution: monetary_pending`, `amount: €5.00`. |
| **State change** | None (verifying side-effect from test 4.2). |

### 8.3 Social class absent — no penalty

| | |
|---|---|
| **Objective** | No-show on a social event does not create a penalty |
| **Steps** | 1. On `/attendance`, find a social event <br> 2. Mark a student as "Absent" |
| **Expected** | Attendance is recorded but no penalty is created. Feedback should confirm no penalty. |
| **State change** | Attendance record only. No penalty. |

---

## 9. Products / Subscriptions

### 9.1 Products page displays catalog

| | |
|---|---|
| **Objective** | `/products` shows all products with access descriptions |
| **Steps** | 1. Go to `/products` <br> 2. Check filters: type (membership, pack, drop_in, promo_pass) <br> 3. Search by product name |
| **Expected** | 11 products visible. Provisional products show a badge. Access descriptions are human-readable (e.g., "All styles - All levels"). |
| **State change** | None. |

### 9.2 Students page shows subscriptions

| | |
|---|---|
| **Objective** | `/students` shows student list with expandable subscription details |
| **Steps** | 1. Go to `/students` <br> 2. Click a student row to expand <br> 3. Check subscription info and wallet transaction history |
| **Expected** | Expanded view shows subscription name, type, credits remaining, validity dates, and wallet transactions. |
| **State change** | None. |

### 9.3 Provisional products are clearly marked

| | |
|---|---|
| **Objective** | Products pending academy confirmation are visually distinct |
| **Steps** | 1. Go to `/products` <br> 2. Look for "Provisional" badges |
| **Expected** | Membership tiers (Bronze/Silver/Gold/Rainbow), yoga products, and Latin Combo show provisional status. Drop-in, Beg 1&2 Pass, and Social Pass do NOT. |
| **State change** | None. |

---

## 10. Classes (Read-Only)

### 10.1 Class templates page

| | |
|---|---|
| **Objective** | `/classes` shows class templates with filters |
| **Steps** | 1. Go to `/classes` <br> 2. Use search to find "Bachata" <br> 3. Use day filter to show "Monday" only <br> 4. Use type filter to show "class" only |
| **Expected** | Filters narrow the list correctly. Each template shows title, style, level, day, time, location, capacity. |
| **State change** | None. |

### 10.2 Bookable schedule page

| | |
|---|---|
| **Objective** | `/classes/bookable` shows concrete class instances |
| **Steps** | 1. Click "Schedule" tab or go to `/classes/bookable` <br> 2. Verify each row shows date, time, title, fill rate, waitlist count |
| **Expected** | 14 bookable instances visible. Status badges (open/closed/cancelled) are correct. Classes at high fill rate show red/amber bars. |
| **State change** | None. |

### 10.3 Teachers page

| | |
|---|---|
| **Objective** | `/classes/teachers` shows teacher pair assignments |
| **Steps** | Go to `/classes/teachers` and verify data |
| **Expected** | 10 teacher pairs listed with class, teacher names, effective dates, and active status. Search works. |
| **State change** | None. |

---

## Flows NOT Yet Testable via UI

These are implemented at the domain/service layer but lack UI wiring:

| Flow | What exists | What's missing |
|------|------------|----------------|
| **Cancel a booking** | `cancelStudentBooking` action + `BookingService.cancelBooking()` | No cancel button in `StudentBookings` component |
| **Credit deduction on booking** | `CreditService.deductForBooking()` fully built | Not called by `createStudentBooking` action |
| **Credit refund on cancel** | `CreditService.refundCredit()` fully built | Not called by `cancelStudentBooking` action |
| **Waitlist promotion** | `BookingService.cancelBooking()` auto-promotes | Requires cancel flow (no UI) |
| **Bulk no-show processing** | `PenaltyService.processNoShows()` batch operation | No "Mark all absent" button on attendance page |
| **QR check-in** | `checkInMethod` field in attendance schema | Only manual marking implemented |
| **Waive a penalty** | `resolution: "waived"` type exists | No admin UI to waive penalties |
| **Role-based page access (student/teacher views)** | `canAccessRoute()` + role branching in pages | Fallback auth always returns `role: "admin"` |

All of these flows have **automated test coverage** via Vitest
(227 tests across 12 test files). The missing piece is UI wiring, not business logic.

---

## Settings Page (Informational)

### S.1 Settings displays business rules

| | |
|---|---|
| **Objective** | `/settings` shows current system configuration |
| **Steps** | Navigate to `/settings` |
| **Expected** | Cards showing: penalty rules (€2 late cancel, €5 no-show, 60 min cutoff), role-balance styles, Supabase connection status, Stripe status (placeholder). |
| **State change** | None. |

---

## Test Session Checklist

Run tests in this order for maximum coverage with minimum backtracking:

- [ ] **1.1** Login with demo credentials
- [ ] **1.2** Login with wrong password
- [ ] **2.1** All sidebar links load
- [ ] **2.2** Classes sub-tabs
- [ ] **2.3** Dashboard drill-down links
- [ ] **3.1** Book a regular class — confirmed
- [ ] **3.2** Book a partner class — role required
- [ ] **3.4** Form validation — missing fields
- [ ] **3.3** Book at capacity — waitlisted
- [ ] **6.2** Waitlist visible on schedule page
- [ ] **5.1** Role balance display on dashboard
- [ ] **4.1** Mark present
- [ ] **4.2** Mark absent (no-show penalty)
- [ ] **4.3** Mark late
- [ ] **4.4** Mark excused
- [ ] **8.2** New penalty visible on penalties page
- [ ] **8.1** Penalty list page filters
- [ ] **9.1** Products page
- [ ] **9.2** Students page with subscriptions
- [ ] **10.1** Class templates with filters
- [ ] **10.3** Teachers page
- [ ] **S.1** Settings page
- [ ] **1.3** Logout
- [ ] **1.4** Protected route without session
- [ ] **1.5** Login redirect preserves `next`
