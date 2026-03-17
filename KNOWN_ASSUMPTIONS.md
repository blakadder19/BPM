# Known Assumptions

Decisions and assumptions made during MVP development that depend on
academy confirmation. Each entry is tagged **PROVISIONAL** in code
(config comments, `isProvisional` flags, or UI badges).

---

## Product Tiers

### KA-01: Bronze / Silver / Gold membership scope
**Status: PROVISIONAL**
**Config:** `config/product-access.ts` (p-bronze, p-silver, p-gold)

All three tiers are currently treated as "all styles, all levels,
unlimited classes per period". The real differentiation (e.g. 1 class
per week for Bronze, 3 for Silver) is unknown. The access rules use
`styleAccess: { type: "all" }` and `allowedLevels: null` as
placeholders.

**Action needed:** Academy must confirm per-tier class-per-week limits,
style restrictions, and level restrictions.

### KA-02: Rainbow Membership scope
**Status: PROVISIONAL**
**Config:** `config/product-access.ts` (p-rainbow)

Treated as all-styles unlimited. May include extras (priority booking,
social access) that are not yet modeled.

### KA-03: Yoga product style IDs
**Status: PROVISIONAL**
**Config:** `config/product-access.ts` (p-yoga-*)

Yoga classes are not yet in the schedule. The access rules use
`styleAccess: { type: "fixed", styleIds: [] }` — an empty array that
will grant access to nothing until a Yoga style ID is added.

---

## Booking & Scheduling

### KA-04: Student Practice is not bookable
**Status: PROVISIONAL**
**Config:** `config/business-rules.ts` → `STUDENT_PRACTICE_IS_BOOKABLE`

Set to `false`. If the academy wants students to reserve practice
slots, flip this flag and add capacity tracking.

### KA-05: Socials are excluded from the booking flow
**Status: CONFIRMED**
**Config:** `config/event-types.ts` → `social.bookable = false`

Social events have no capacity, no role balance, no penalties, and
no credit deduction. They appear in the schedule but cannot be booked
through the system. The Social Pass product is typed
`allowedClassTypes: ["social"]` but socials bypass the booking engine.

### KA-06: Allowed role imbalance = 2
**Status: PROVISIONAL**
**Config:** `config/business-rules.ts` → `ALLOWED_ROLE_IMBALANCE`

A partner class can have up to 2 more leaders than followers (or vice
versa) before additional bookings of the over-represented role are
waitlisted. The exact tolerance may vary by class or academy preference.

---

## Penalties & Cancellations

### KA-07: Cancellation cutoff = 60 minutes
**Status: PROVISIONAL**
**Config:** `config/business-rules.ts` → `LATE_CANCEL_CUTOFF_MINUTES`

Cancellations within 60 minutes of class start incur a late-cancel
fee. The academy may want a different window (e.g. 24 hours).

### KA-08: Late cancel fee = €2.00, No-show fee = €5.00
**Status: PROVISIONAL**
**Config:** `config/business-rules.ts` → `LATE_CANCEL_FEE_CENTS`, `NO_SHOW_FEE_CENTS`

These amounts are placeholders.

### KA-09: Penalties are class-only
**Status: CONFIRMED**
**Config:** `config/event-types.ts` → `penaltiesApply` per class type

Only `class` type has `penaltiesApply: true`. Socials and student
practice are excluded. This is enforced in `penaltiesApplyTo()` which
is called by both `assessLateCancelPenalty` and `assessNoShowPenalty`.

### KA-10: No blocking system for unpaid penalties
**Status: CONFIRMED**

Students with `monetary_pending` penalties can still book classes.
There is no automatic blocking. The admin penalties page highlights
unresolved penalties for manual follow-up.

---

## Credits & Subscriptions

### KA-11: Credit deduction priority order
**Status: PROVISIONAL**
**Config:** `config/business-rules.ts` → `CREDIT_DEDUCTION_PRIORITY`

Order: `promo_pass → pack → drop_in → membership`. The assumption is
that limited-use passes should be consumed before unlimited
memberships. The academy may prefer a different order.

### KA-12: Beginners Latin Combo — pick 2 of 3 styles
**Status: PROVISIONAL**
**Config:** `config/product-access.ts` → `LATIN_COMBO_POOL_STYLE_IDS`

The pool is Bachata (ds-1), Cuban (ds-4), Salsa Line (ds-5). The
student picks 2 at purchase time. If the academy adds more Latin
styles or changes the pool, update the array.

### KA-13: Beginners 1 & 2 Promo Pass — one selected style
**Status: CONFIRMED**
**Config:** `config/product-access.ts` (p-beg12)

The student selects one style at purchase. The pass covers Beginner 1
and Beginner 2 levels for that style only. This is enforced via
`styleAccess: { type: "selected_style" }` and
`allowedLevels: ["Beginner 1", "Beginner 2"]`.

---

## Role Balancing

### KA-14: Role balance is per dance style, not per class
**Status: CONFIRMED**
**Config:** `DANCE_STYLES[].requiresRoleBalance`

Partner styles (Bachata, Cuban, Salsa Line, etc.) require role balance.
Solo styles (Reggaeton, Ladies Styling, Afro-Cuban) do not. This is a
property of the dance style, propagated to each class instance via
`ClassSnapshot.danceStyleRequiresBalance`.

### KA-15: Waitlist offer expiry = 4 hours
**Status: PROVISIONAL**
**Config:** `config/business-rules.ts` → `WAITLIST_OFFER_EXPIRY_HOURS`

When a spot opens, the first waitlisted student gets an offer valid
for 4 hours. Not yet enforced (see TECH_DEBT.md TD-07).
