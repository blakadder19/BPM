# BPM Project Checkpoint — 2026-03-19

## 1. Project Snapshot

**What BPM is:** A lightweight booking system for Balance Power Motion (BPM), a social dance academy in Dublin. Students book dance classes, join waitlists, and manage cancellations. Admins manage terms, products, student entitlements, attendance, and penalties.

**Prototype status:** Functional MVP prototype with a complete business layer. All core booking, attendance, and product flows work end-to-end. The product catalog now reflects real academy offerings with accurate membership tiers, benefits, and payment metadata.

**Architecture:**

- Next.js 15 App Router with TypeScript
- Tailwind CSS for styling
- In-memory stores seeded from `lib/mock-data.ts`
- Server actions for all mutations
- Pure domain functions for business rules
- Zod for server-side validation
- No Supabase connection yet (placeholder only)
- No Stripe/Revolut integration (placeholder only)

**Environment assumptions:**

- Local dev only (`npm run dev`)
- All data resets on full server restart
- Critical stores use `globalThis` for HMR persistence
- Non-critical stores use module-level `let`
- Settings persisted to `.data/settings.json`
- Dev-only impersonation via cookies (`dev_role`, `dev_student_id`)

---

## 2. What Was Added/Refined In This Checkpoint

This checkpoint finalizes the **academy business layer** — aligning the product catalog, member benefits, payment recording, and historical product display with how BPM actually sells access and grants perks.

### A. Final Product Catalog

- `MockProduct` extended with `longDescription: string | null` and `benefits: string[] | null`
- All 12 products have realistic `description` and `longDescription` text
- 4 membership tiers (4/8/12/16 classes per term) include benefit arrays: `["Birthday week free class", "Member giveaways", "Free weekend Student Practice"]`
- Product store and actions updated to handle `longDescription` in create/update flows
- Admin product detail panel displays both short and long descriptions

### B. Product & Class Descriptions

- `MockDanceStyle` extended with `description: string | null` — all 8 dance styles populated with real descriptions
- New `config/class-levels.ts` defines 4 class levels (Beginner 1, Beginner 2, Intermediate, Open) with descriptions
- Class-level descriptions surfaced as tooltips on level badges in student class browser
- Product descriptions shown in student dashboard entitlement cards

### C. Member Benefits / Perks Logic

- New `lib/domain/member-benefits.ts` — pure functions:
  - `isBirthdayWeek(dateOfBirth, referenceDate)` — 7-day window detection
  - `isMemberGiveawayEligible(subscriptions)` — active membership check
  - `hasFreePracticeAccess(subscriptions)` — active membership check
  - `computeMemberBenefits(opts)` — aggregated `MemberBenefitsSummary`
- New `lib/services/birthday-benefit-store.ts` — in-memory tracker for birthday free class redemptions per student per year
- New constants in `config/business-rules.ts`: `BIRTHDAY_WEEK_DURATION_DAYS = 7`, `MEMBERSHIP_BENEFITS` array
- Student dashboard shows "Member Benefits" card with birthday-week status, giveaway eligibility, free Student Practice indicator
- Admin student detail panel shows member benefits section with eligibility badges

### D. Product Access Rules

- All 4 membership tiers updated to include `"student_practice"` in `allowedClassTypes`
- Passes and drop-ins remain restricted to `["class"]` only
- Social pass restricted to `["social"]` only
- Stale test blocks for non-existent product IDs removed from `product-access-config.test.ts`

### E. Payment Method & Sales Metadata

- `PaymentMethod` type extended: added `"card"` and `"revolut"` (now 7 values: stripe, cash, card, bank_transfer, revolut, manual, complimentary)
- New `SalePaymentStatus` type: `"paid" | "pending" | "complimentary" | "waived"`
- `MockSubscription` extended with `paymentStatus`, `assignedBy`, `assignedAt` fields
- Subscription store, service, and actions updated to handle all new fields
- Admin "Add Subscription" dialog includes Payment Method (7 options) and Payment Status (4 options) dropdowns
- Admin "Edit Subscription" dialog supports status updates with friendly labels
- SubCard renders payment method badge, payment status badge (if not "paid"), and assignedBy/assignedAt metadata

### F. Historical Status Display Labels

- New `lib/domain/subscription-display-status.ts`:
  - `deriveDisplayStatus(sub, allStudentSubs)` — context-aware label derivation
  - `SUBSCRIPTION_STATUS_LABELS` — reusable label map
- Status mapping logic:
  - `active` → **Active**
  - `paused` → **Paused**
  - `exhausted` → **Finished** (all credits/classes consumed)
  - `expired` + newer active sub of same type → **Replaced**
  - `expired` (no replacement) → **Expired**
  - `cancelled` → **Cancelled**
- `StatusBadge` updated: `exhausted` entry now shows "Finished", new entries for `finished` and `replaced`
- `SubCard` in student detail panel uses `deriveDisplayStatus()` with full student subscription context
- Admin edit form shows "Finished" label for the internal `exhausted` value
- Dev panel uses `SUBSCRIPTION_STATUS_LABELS` for friendly fallback text
- Booking dialogs show "Finished" instead of "Exhausted" for consumed drop-ins
- **"Exhausted" no longer appears anywhere as a user-facing label**

### G. Student Dashboard Improvements

- Entitlement cards show product description and selected style name
- New "Member Benefits" card for active members showing birthday, giveaway, and practice eligibility
- Benefits computed server-side via `computeMemberBenefits()` and passed as props

### H. Admin Students Improvements

- Active vs historical products clearly separated with count headers
- Historical products use contextual status badges (Finished/Expired/Cancelled/Replaced)
- Active subscriptions render with white background; historical with muted background and opacity
- Payment metadata (method, status, assignedBy, assignedAt) displayed on every subscription card

### I. Seed Data Enhancements

- Alice has a historical expired 8 Classes Membership (sub-01-hist) plus active 12 Classes Membership — demonstrates Replaced status
- Eve has a complimentary drop-in
- Finn's DOB set to March 21 for birthday-week testing
- Eve's DOB set to March 20 for birthday-week testing
- Payment methods diversified: card, cash, bank_transfer, revolut, complimentary
- All subscriptions include paymentStatus, assignedBy, assignedAt metadata

---

## 3. Business Rules Currently Enforced

### Membership Tiers

- 4 / 8 / 12 / 16 classes per 4-week term
- Counter-based usage: `classesUsed` / `classesPerTerm`
- Term-bound, auto-renew flag supported
- Benefits: birthday-week free class, member giveaways, free weekend Student Practice

### Pass / Drop-in Separation

- Passes: credit-based (`remainingCredits` / `totalCredits`), style-restricted via access rules, term-bound
- Drop-ins: single-use (1 credit), not term-bound, all styles/levels
- Promo passes: Beginners 1&2 (single style), Latin Combo (PROVISIONAL, 2-of-3 styles)

### Birthday Eligibility Foundation

- `isBirthdayWeek()` detects if current date falls within 7 days of student's birthday
- Birthday benefit store tracks one-time redemptions per student per year
- Birthday eligibility visible in student dashboard and admin student panel
- Auto-application during booking not yet implemented (foundation only)

### Giveaway Eligibility

- Any student with an active membership subscription is flagged as giveaway-eligible
- Visible in admin student detail panel and student dashboard

### Free Student Practice Member Benefit

- Membership access rules include `"student_practice"` in `allowedClassTypes`
- `hasFreePracticeAccess()` returns true for any active membership holder
- Visible in student dashboard benefits card and admin student panel

### Payment Method & Status Capture

- 7 payment methods: stripe, cash, card, bank_transfer, revolut, manual, complimentary
- 4 payment statuses: paid, pending, complimentary, waived
- Admin can set payment method and status when assigning products
- Sales metadata (assignedBy, assignedAt) recorded on every subscription

### Historical Status Display Mapping

| Internal Status | Condition | Display Label |
|---|---|---|
| `active` | — | **Active** |
| `paused` | — | **Paused** |
| `exhausted` | — | **Finished** |
| `expired` | Newer active sub of same type exists | **Replaced** |
| `expired` | No active replacement | **Expired** |
| `cancelled` | — | **Cancelled** |

### Pre-existing Rules (unchanged)

- Terms: 4-week cycles, beginner intake restricted to weeks 1–2
- Booking: 10-step bookability engine, duplicate prevention, role balance
- Cancellation: free >60min, late-cancel <60min with penalty, blocked after start
- Attendance: present/late/absent/excused with credit and penalty side-effects
- Penalties: late_cancel EUR 2.00, no_show EUR 5.00 (no-show OFF by default)
- Waitlist: role-aware FIFO with auto-promotion on cancellation
- Code of Conduct: versioned acceptance required before booking
- Check-in: QR/token foundation, self-check-in with configurable time window

---

## 4. Current User/Admin Flows Affected

### Admin Assigns Product

1. Admin opens `/students` → expands student → clicks "Add"
2. Selects product, term, payment method, payment status → submits
3. Subscription created with full sales metadata (paymentMethod, paymentStatus, assignedBy, assignedAt)
4. Student detail panel updates immediately showing the new subscription

### Admin Records Payment Method/Status

- Payment method dropdown includes: Stripe, Cash, Card, Bank Transfer, Revolut, Manual/Admin Grant, Complimentary
- Payment status dropdown includes: Paid, Pending, Complimentary, Waived
- Both visible on subscription cards in admin student panel

### Student Sees Product and Benefits

- Student dashboard shows active entitlements with description, usage stats, and selected style
- Members see a "Member Benefits" card showing:
  - Birthday week free class eligibility (with current-year status)
  - Member giveaway eligibility
  - Free weekend Student Practice access

### Admin Sees Active vs History Clearly

- Active Products section with count header, white card backgrounds
- Product History section with count header, muted backgrounds
- Historical products show contextual status: Finished (used up), Expired (term ended), Cancelled (manually closed), Replaced (superseded by newer active sub)

---

## 5. Known Limitations / Next Gaps

### Business Layer Gaps

- **Birthday free class not auto-applied during booking:** The eligibility foundation exists (detection, tracking, UI), but the booking action does not yet automatically grant a free class during birthday week. Manual handling required.
- **Giveaway distribution not automated:** Eligibility is tracked, but there is no mechanism to assign or track specific giveaway items.
- **Student Practice booking behavior:** Members have access-rule entitlement for student_practice, but the class type is still "Pay at reception" / not online-bookable. The free-access benefit is informational only.

### Architecture / Persistence

- **In-memory only:** All data resets on full server restart. No database.
- **No real authentication:** Dev-only cookie-based role switching.
- **No real payments:** Stripe and Revolut are payment method options only — no gateway integration.
- **No email/SMS notifications.**
- **HMR inconsistency:** Critical stores use `globalThis`; non-critical stores use module-level `let`.

### Data Model

- **MockProduct vs Product type gap:** MockProduct has extra fields not in canonical Product type.
- **MockSubscription vs StudentSubscription type gap:** Significant schema gap needing reconciliation before DB migration.
- **Waitlist promotion doesn't deduct credits:** Auto-promoted students get a free class.
- **Admin dashboard uses hardcoded MOCK_TODAY** instead of live date.

### Pre-existing Test Issues

- 8 penalty-related test failures exist due to no-show penalties being OFF by default. These are pre-existing and unrelated to the business-layer changes.

---

## 6. Recommended Next Phase

**Phase: Data Consistency Hardening + Waitlist Credit Fix**

Priority fixes before adding new features or migrating to a database:

1. **Waitlist promotion credit deduction** — when auto-promoted from waitlist, link to subscription and deduct credit
2. **Birthday free class auto-application** — integrate birthday eligibility check into booking action so the free class is granted automatically
3. **Fix admin dashboard MOCK_TODAY** — use live date
4. **Fix no-show penalty subscription lookup** — pass actual student subscriptions
5. **Migrate remaining stores to globalThis** — consistency across HMR
6. **Reconcile Mock types with canonical types** — prepare for Supabase migration

After hardening:

- **Supabase Integration** — real database, real auth, data persistence
- **Payment Integration** — Stripe/Revolut for subscriptions, penalty collection
- **Student Self-Registration** — public signup flow

---

## 7. Files Changed In This Checkpoint

### New Files

| File | Purpose |
|---|---|
| `config/class-levels.ts` | Class level definitions with descriptions |
| `lib/domain/member-benefits.ts` | Birthday week, giveaway, practice benefit logic |
| `lib/domain/subscription-display-status.ts` | Academy-friendly historical status derivation |
| `lib/services/birthday-benefit-store.ts` | Birthday free class redemption tracker |

### Modified Files (22)

| File | Change Summary |
|---|---|
| `types/domain.ts` | Added `card`, `revolut` to PaymentMethod; added `SalePaymentStatus` type |
| `lib/mock-data.ts` | Extended MockProduct (longDescription), MockDanceStyle (description), MockSubscription (paymentStatus, assignedBy, assignedAt); enriched seed data |
| `lib/services/product-store.ts` | `longDescription` in create/update |
| `lib/services/product-service.ts` | `longDescription` passthrough |
| `lib/actions/products.ts` | `longDescription` from form data |
| `lib/services/subscription-store.ts` | `paymentStatus`, `assignedBy`, `assignedAt` in create/update |
| `lib/services/subscription-service.ts` | Payment metadata passthrough |
| `lib/actions/subscriptions.ts` | Payment status validation, sales metadata capture |
| `lib/actions/dev-tools.ts` | Payment metadata on dev-assigned products |
| `config/business-rules.ts` | `BIRTHDAY_WEEK_DURATION_DAYS`, `MEMBERSHIP_BENEFITS` constants |
| `config/product-access.ts` | `student_practice` added to membership allowedClassTypes |
| `config/__tests__/product-access-config.test.ts` | Removed stale tests, added student_practice tests |
| `components/ui/status-badge.tsx` | Remapped `exhausted` → "Finished"; added `finished`, `replaced` entries |
| `components/products/product-detail-panel.tsx` | Displays `longDescription` |
| `components/booking/student-class-card.tsx` | Class level tooltip descriptions |
| `components/booking/booking-dialogs.tsx` | "Exhausted" → "Finished" label |
| `components/dashboard/student-dashboard.tsx` | Product description, selected style, member benefits card |
| `components/students/admin-students.tsx` | Benefits computation for student detail panel |
| `components/students/student-detail-panel.tsx` | `deriveDisplayStatus()` integration, benefits section, payment metadata display |
| `components/students/student-dialogs.tsx` | Friendly status labels, payment status dropdown |
| `components/dev/dev-panel.tsx` | `SUBSCRIPTION_STATUS_LABELS` for friendly status text |
| `app/(app)/dashboard/page.tsx` | Benefits computation, product description in entitlements |

---

## 8. Resume Instructions

### Quick start

```bash
cd /Users/lopezmalejandro/Desktop/BPM
npm run dev
# Open http://localhost:3000
```

### Testing the new business-layer features

1. **Product descriptions:** Go to `/products` → expand any product → see short + long description
2. **Member benefits:** Switch to Student role → impersonate Finn Doyle (s-06, birthday March 21) → see birthday-week eligibility on dashboard
3. **Payment metadata:** Admin `/students` → expand any student → see payment method/status badges on subscriptions
4. **Historical status:** Admin `/students` → expand Alice (s-01) → see active 12 Classes Membership and historical 8 Classes Membership showing "Replaced"
5. **Class level tooltips:** Student `/classes` → hover over level badges (Beginner 1, Intermediate, etc.)
6. **Revolut payment:** Admin `/students` → expand Finn → see Revolut payment method on subscription

### Where to find the new code

| What | Where |
|---|---|
| Member benefits logic | `lib/domain/member-benefits.ts` |
| Birthday benefit tracker | `lib/services/birthday-benefit-store.ts` |
| Historical status derivation | `lib/domain/subscription-display-status.ts` |
| Class level config | `config/class-levels.ts` |
| Business rule constants | `config/business-rules.ts` |
| Product access rules | `config/product-access.ts` |

### Conversation history

Prior implementation work is documented in agent transcripts: `dff6013f-fed0-439c-b94d-da9d37b0b84f` (business-layer implementation).
