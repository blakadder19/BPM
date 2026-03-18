---
name: Bookings Module Refinement
overview: Refine Admin Bookings with searchable selects, better quick links, subscription linking, booking restoration, and build student-facing cancellation flow.
todos:
  - id: searchable-select
    content: Build SearchableSelect component in components/ui/searchable-select.tsx
    status: completed
  - id: schedule-search-params
    content: Add searchParams to Schedule page and initialSearch to AdminSchedule
    status: completed
  - id: quick-links
    content: Improve booking detail panel quick links (schedule, waitlist badge)
    status: pending
  - id: searchable-dialogs
    content: Replace plain selects with SearchableSelect in AddBookingDialog for student and class
    status: pending
  - id: class-instance-rules
    content: Filter class instances to future-only in bookings page, sort by date ascending
    status: pending
  - id: source-cleanup
    content: Remove walk_in from source options in dialogs, admin table filters, and server action
    status: pending
  - id: subscription-select
    content: Wire subscription selection by student (from subscription store) into AddBookingDialog
    status: pending
  - id: restore-booking
    content: Add restoreBooking to BookingService, server action, and UI buttons in admin table/detail panel
    status: pending
  - id: student-cancel
    content: Build student cancel action, cancel dialog with late-cancel warning, and upcoming/past split in StudentBookings
    status: pending
  - id: verify
    content: TypeScript compile, lint check, verify all changes work together
    status: pending
  - id: todo-1773858027604-xojfbs4f7
    content: ""
    status: pending
isProject: false
---

# Bookings Module Refinement

## Current State

- Admin Bookings has a working table with filters, detail panel, manual booking creation, cancellation with late-cancel warning, and waitlist management
- Student Bookings is read-only (no cancel action)
- Student/class selectors use plain `<select>` dropdowns (won't scale)
- Subscription field is free text (should link to real student subscriptions)
- No restore/reinstate action for cancelled bookings
- Quick links point to generic pages without proper filtering
- Schedule page has no `searchParams` support (Attendance and Penalties do)
- No `SearchableSelect` / combobox UI component exists yet
- Source options include `walk_in` (to be removed)

---

## 1. Build SearchableSelect Component

**New file:** components/ui/searchable-select.tsx

Build a lightweight combobox: text input + filtered dropdown list, no external dependency. Props: `options: {value, label, detail?}[]`, `value`, `onChange`, `placeholder`, `disabled`. Uses portal-free approach (absolute-positioned dropdown below input). Keyboard support: arrow keys, Enter to select, Escape to close. Reusable across all admin modules.

---

## 2. Improve Quick Links

### 2a. Add searchParams support to Schedule page

**Modify:** app/(app)/classes/bookable/page.tsx -- accept `searchParams?: { search?: string }`, pass `initialSearch` prop to `AdminSchedule`

**Modify:** components/classes/admin-schedule.tsx -- accept `initialSearch` prop, seed `search` state with it

### 2b. Update quick links in booking detail panel

**Modify:** components/booking/booking-detail-panel.tsx:

- Class Schedule link: `/classes/bookable?search=CLASS_TITLE`
- Attendance link: `/attendance?classTitle=CLASS_TITLE&date=DATE` (already works)
- Penalties link: `/penalties?classTitle=CLASS_TITLE&date=DATE` (already works)
- Waitlist: replace raw text with a styled badge/button that triggers the waitlist dialog; always show as a quick-link button (not just when count > 0 -- show "Waitlist (0)" cleanly)

---

## 3. Searchable Student and Class Selectors in AddBookingDialog

**Modify:** components/booking/booking-dialogs.tsx `AddBookingDialog`:

- Replace `<select>` for Student with `SearchableSelect` -- searches by name
- Replace `<select>` for Class Instance with `SearchableSelect` -- shows title, date, time, capacity in label

---

## 4. Class Instance Listing Rules

**Modify:** app/(app)/bookings/page.tsx -- filter `classInstanceOptions`:

- Only future instances (`date >= today`)
- Only `open` or `scheduled` status (already done)
- Sort ascending by date then time (already done via `getInstances()` order, but add explicit sort)

---

## 5. Clean Up Source Options

**Modify:** components/booking/booking-dialogs.tsx and components/booking/admin-bookings.tsx:

- Remove `walk_in` from `SOURCE_OPTIONS`
- Keep: Subscription, Drop-in, Admin, Waitlist promotion (filter-only, not in create dialog)

**Modify:** lib/actions/bookings-admin.ts:

- Remove `walk_in` from `VALID_SOURCES`

---

## 6. Subscription / Product Selection

**Modify:** app/(app)/bookings/page.tsx:

- Import subscriptions from `getSubscriptions()` in lib/services/subscription-store.ts
- Build a `subscriptionsByStudent` map: `Map<studentId, {id, productName, status, remainingCredits}[]>`
- Pass `subscriptionOptions` to `AdminBookings` keyed by studentId

**Modify:** components/booking/booking-dialogs.tsx `AddBookingDialog`:

- Accept `subscriptionsByStudent` prop
- When student is selected, filter to show that student's active subscriptions
- Replace free-text `subscriptionName` with `SearchableSelect` showing the student's subscriptions
- If source = `drop_in` or `admin`, subscription field becomes optional / hidden
- Submit the selected subscription's `productName` as `subscriptionName`

**Modify interfaces:**

- `AddBookingDialog` props: add `subscriptionsByStudent: Record<string, SubscriptionOption[]>`
- `AdminBookingsProps`: add `subscriptionsByStudent`

---

## 7. Restore Cancelled Booking

### Service layer

**Modify:** lib/services/booking-service.ts -- add `restoreBooking(bookingId)`:

- Find booking in `cancelled` or `late_cancelled` status
- Check capacity via `getCapacity()` + `canBook()`
- If capacity allows: set status back to `confirmed`, clear `cancelledAt`
- If class is full: return `{ type: "restored_to_waitlist" }` or `{ type: "error", reason: "Class is full" }`
- Return outcome with warnings (e.g., "related penalty exists")

### Server action

**Modify:** lib/actions/bookings-admin.ts -- add `adminRestoreBookingAction(bookingId)`:

- Call `bookingService.restoreBooking(bookingId)`
- Check if a linked penalty exists via `penaltyService.getAllPenalties().find(p => p.bookingId === bookingId)`
- Return `{ success, restoredTo, hasLinkedPenalty }`
- Revalidate `/bookings` and `/penalties`

### UI

**Modify:** components/booking/admin-bookings.tsx:

- For cancelled/late_cancelled bookings, show "Restore" button in row actions

**Modify:** components/booking/booking-detail-panel.tsx:

- For cancelled bookings, show "Restore Booking" button in Actions section
- If penalty exists, show warning text: "A penalty is linked to this booking. Restoring will not automatically remove it."

---

## 8. Student Cancellation Flow

### Student bookings UI

**Modify:** components/booking/student-bookings.tsx:

- Split bookings into "Upcoming" and "Past" sections (by `date >= today`)
- For upcoming active bookings (`confirmed`/`checked_in`), add a "Cancel" button
- Clicking Cancel:
  - Calls `checkLateCancelStatusAction(bookingId)` to determine late status
  - If NOT late: show simple confirm dialog
  - If late: show amber warning with text: "This booking is within the late cancellation window. Cancelling now may trigger a penalty."
- On confirm: call new `studentCancelBookingAction(bookingId)`

### Student cancel action

**New file:** lib/actions/booking-student.ts -- `studentCancelBookingAction(bookingId)`:

- Reuses same logic as admin cancel: check late status, cancel via `BookingService.cancelBooking()`, assess penalty if late
- Returns `{ success, isLate, penaltyApplied, penaltyDescription }`
- Revalidates `/bookings`

### Student cancel dialog

**Modify:** components/booking/student-bookings.tsx:

- Add inline `StudentCancelDialog` component (modal with booking summary, late-cancel warning, confirm/keep buttons)
- After cancellation, show result banner (success, penalty info)

---

## 9. BookingView Interface Stability

The enriched `BookingView` from app/(app)/bookings/page.tsx already has all needed fields. No changes to the interface needed.

---

## Files to Change

**New files:**

- `components/ui/searchable-select.tsx` -- reusable combobox component
- `lib/actions/booking-student.ts` -- student cancel action

**Modified files:**

- `lib/services/booking-service.ts` -- add `restoreBooking()`
- `lib/actions/bookings-admin.ts` -- add `adminRestoreBookingAction()`, remove `walk_in` from valid sources
- `app/(app)/bookings/page.tsx` -- pass subscription options, filter future instances only
- `app/(app)/classes/bookable/page.tsx` -- add searchParams support
- `components/classes/admin-schedule.tsx` -- accept `initialSearch` prop
- `components/booking/admin-bookings.tsx` -- restore action, remove walk_in source, pass subscriptionsByStudent
- `components/booking/booking-dialogs.tsx` -- searchable selects for student/class/subscription, remove walk_in source
- `components/booking/booking-detail-panel.tsx` -- improved quick links, restore action, waitlist badge
- `components/booking/student-bookings.tsx` -- cancel flow with late-cancel warning, upcoming/past split

