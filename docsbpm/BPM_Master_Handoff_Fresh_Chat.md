**BPM Booking System**  
**Master Handoff for Fresh Chat**

*Comprehensive project state, decisions, rules, completed work, and next steps*

| Current state | Admin foundation is strong, Phase 1 and Phase 2 are effectively complete, and the next active objective is to align remaining BPM real data and then move into QR / Stripe / weekly-event follow-up. |
| :---- | :---- |
| **What a new chat should do first** | Do not re-open old generic admin bug hunting. Assume the core admin is stable. Focus on BPM data alignment, remaining business-rule implementation, then QR / Stripe / weekly event. |
| **Critical note** | The user prefers small prompts/batches because large Cursor prompts often hang. |

## **Phase status**

| Phase | Status | Notes |
| :---- | :---- | :---- |
| Phase 1 | Done | Reset, Supabase persistence, seeds, stable baseline. |
| Phase 2 | Effectively done | BPM rules layer mostly applied; only downstream polish/integration remains. |
| Phase 3 | Next | Align real BPM data fully, then Studio Hire, then email Anisia, then QR / Stripe / weekly event. |

# **1\. What has already been achieved**

Phase 1 baseline is effectively in place: Supabase is working, DEV reset and seeds exist, data persists across refresh/restart, and the project can be reset and reseeded into a consistent BPM baseline.

Phase 2 BPM rule adaptation is largely done: penalties hidden for students, socials removed from booking flow, term cutoff student messaging changed, student practice/weekend practice rules implemented, payment choice UI scaffold added, and QR groundwork added.

Admin core has already gone through heavy QA and most of the original structural bugs were fixed earlier: DB-first persistence, template delete protections, term-bound logic, teacher overrides persistence, booking lifecycle, attendance lifecycle, and student/product flows.

# **2\. Current project truth**

Treat the core admin as stable unless there is strong evidence otherwise. Do not restart wide bug hunts.

Current priority is BPM-specific alignment using the real information provided by the academy, followed by finishing the remaining product-facing features.

The user wants minimal unnecessary logic changes. Only change program logic when strictly needed.

The user prefers micro-batches and short prompts because Cursor can hang on large prompts.

# **3\. Phases completed so far**

Phase 1: reset \+ Supabase-first baseline \+ seeds infrastructure.

Phase 2: BPM-specific visible rules and behavior adjustments.

# **4\. BPM rules already implemented**

* Penalties are hidden from the student experience but remain intact in admin.  
* Absent refunds are controlled by settings; BPM currently wants no refund on absent, so refundCreditOnAbsent should remain OFF by default.  
* Socials are hidden from the booking flow and should not appear as bookable classes for students/admin booking selection.  
* When a student is outside the late-entry cutoff for a term-bound course, the message now tells them to wait for the next term instead of “speak to reception.”  
* Student Practice \= Weekend Practice. It is not bookable, does not consume credits, is free for active members or for students who attended a regular class that same day, and otherwise is €5 at reception.  
* Payment choice UI groundwork exists: pay at reception, Stripe placeholder, complimentary/admin option where applicable.  
* QR groundwork exists: permanent student QR direction is established in architecture, but the full feature is not implemented yet.

# **5\. Admin areas — practical status**

| Area | State | Notes |
| :---- | :---- | :---- |
| Classes / Templates / Schedule | Strong | Core admin behavior was heavily QA’d and stabilized earlier. |
| Teachers | Strong | Roster seeding moved away from Maria/Carlos placeholders; default assignments should not be guessed. |
| Terms | Strong | Deletion dependencies and term-bound messaging logic are in place. |
| Settings | Strong | Core flags work; BPM uses no refund on absent. |
| Bookings | Strong | Create/cancel/restore/delete flows work; late-entry logic works. |
| Attendance | Strong | Present/Late/Absent/Excused stable; practice walk-in logic added. |
| Students | Strong | CRUD, subscriptions, booking history, and detail behavior are mostly stable. |
| Products | Good but needs BPM real catalog alignment | Simplified seed must be replaced/aligned with the full BPM catalog. |
| Penalties | Present but de-emphasized | Kept for admin; hidden from students because BPM does not want them now. |
| Studio Hire | Not implemented yet | Should be added as a separate enquiry module, not mixed into class booking. |

# **6\. BPM people / teacher roster to use**

These are the BPM roster names that should be treated as real. Maria Garcia and Carlos Rivera were placeholders and should not be used.

| Name | Group |
| :---- | :---- |
| Bilge | Core instructor |
| Berkan | Core instructor |
| Guillermo | Core instructor |
| Zaria | Core instructor |
| Mario | Instructor |
| Camila | Instructor |
| Miguel | Instructor |
| Seda | Instructor |
| Corey | Assistant |
| Orlath | Assistant |
| Marta | Assistant |
| Laura | Assistant |
| Jennifer Donnelly | Yoga / breathwork / mindfulness |
| Gizem Gunez | Yoga / mindfulness |

# **7\. BPM business rules confirmed directly by the academy**

* Penalties: keep the code and admin side, but hide penalties from students for now.  
* No refunds if a student is absent.  
* If a student is outside the allowed late-entry weeks for a term-bound course, they should not see “speak to reception”; they should see a message telling them to wait for/book the next term instead.  
* Student Practice and Weekend Practice are the same thing.  
* Student Practice is not bookable.  
* Student Practice does not consume credit.  
* Student Practice is free if the student has an active membership.  
* Student Practice is also free if the student attended a regular class that same day.  
* Student Practice is €5 at reception if the student has no active membership and did not attend a class that same day.  
* If a person does not have a membership, they do not pre-book weekend/student practice in the system; they pay in person.  
* Socials should not appear in the booking system.  
* Weekly event is still pending clarification from Zaria.  
* Payment flow direction: offer Pay online (Stripe) or Pay at reception. Reception may then handle cash/Revolut internally.

# **8\. DEV reset and seed workflow**

* Reset All Data does not happen automatically on restart. If data still appears after a server restart, that is normal unless Reset All Data was explicitly run.  
* Seed means loading baseline data into Supabase so the app has a consistent starting point.  
* The clean order is: Reset All Data → Seed BPM Products → Seed Terms \+ Teachers → Seed Templates \+ Assignments → Seed April Schedule.  
* Seeds are meant to be idempotent. Re-running a seed should skip existing rows rather than duplicate them.

# **9\. What still needs BPM data alignment**

* Products seed must be aligned to the full real BPM catalog (the simplified seed is not enough).  
* Templates and April schedule seed must be aligned to the real timetable from the BPM information.  
* Studio Hire / Enquiries module still needs to be created.  
* Teacher default assignments should not be guessed unless confirmed.  
* Weekly event remains pending; do not guess its behavior.  
* Stripe real integration is not done; only a placeholder/UI preparation exists.  
* QR full implementation is not done; only architecture groundwork exists.

# **10\. Real BPM product catalog to align seed with**

The fresh chat should treat the following as the real product direction to encode in the BPM product seed and admin data model.

| Group | Examples | Notes |
| :---- | :---- | :---- |
| Drop-in / passes | Drop In, Bronze/Silver/Gold Latin Pass, Bronze/Silver/Gold Yoga Pass | Use real names/prices from BPM info; do not assume simplified old seed is correct. |
| Promo / combos | Beginners 1 and 2 Promo Pass, Latin Combo, Social Pass | Need exact catalog alignment. |
| Memberships | Bronze/Silver/Gold Standard, Bachata, Salsa, Yoga, plus Rainbow Membership | Should reflect the real BPM offerings and descriptions. |

# **11\. Real BPM schedule alignment target**

* Tuesday includes yoga blocks.  
* Wednesday includes Kids Hip Hop, Yoga Strength & Stability, Cuban Beginners 1, Salsa Line Beginners 1, Bachata Beginners 1, Bachata Intermediate, and Social.  
* Friday includes Cuban Improvers, Cuban Intermediate, Salsa Line Improvers, Salsa Line Intermediate, Bachata Traditional, Bachata Improvers, Bachata Intermediate, and Social.  
* Saturday and Sunday include beginner/intermediate dance classes plus Student Practice; Sunday also includes Yoga Reset & Recovery.  
* Monday content looked partially ambiguous in prior extraction and should be aligned carefully rather than guessed.

# **12\. Studio Hire / Enquiries target**

* Studio Hire should be a separate page/module, not mixed into normal student class booking.  
* Rates should not be shown publicly.  
* There should be a contact/enquiry form with options such as Booking enquiry, Classes, General enquiry, Technical issues, and Feedback.  
* If Booking enquiry is selected, ask for date, time(s), expected attendees, booking type (class/workshop/event), type of event, single event or block booking, and a description box.  
* A first version can be UI-first if persistence/email dispatch is deferred, but it must not pretend to be fully wired if it is not.

# **13\. What still needs to be asked to Anisia**

| Topic | Reason |
| :---- | :---- |
| Stripe | Need to know whether BPM already has a Stripe account, who manages it, and whether access/details can be shared for setup. |
| Weekly event / Zaria | This remains explicitly pending and should not be guessed. |
| Studio Hire priority | Confirm whether it should be in the current build or follow-up phase. |

# **14\. Recommended next steps for the fresh chat**

1. Do not go back to broad admin bug hunting.  
2. First align the BPM products seed to the real catalog.  
3. Then align templates and April schedule to the real timetable.  
4. Then build Studio Hire / Enquiries as a separate module.  
5. Then draft/send the email to Anisia asking for Stripe details, weekly event clarification from Zaria, and Studio Hire priority if still needed.  
6. After that, move into QR full implementation, Stripe real implementation, and weekly event handling.

# **15\. Working style preferences that matter**

* Use small prompts and small implementation batches. Large Cursor prompts often hang.  
* Avoid changing program logic unless strictly necessary.  
* Do not invent BPM rules when unclear; either use confirmed rules or leave a TODO and ask.  
* The user wants practical progress, not abstract planning loops.  
* When data is already known from the BPM information, implement it directly instead of waiting.

# **16\. Immediate action list for the next chat**

| Priority | Action |
| :---- | :---- |
| 1 | Update the product seed to the full real BPM catalog. |
| 2 | Update templates and April schedule to the real timetable. |
| 3 | Build Studio Hire / Enquiries page/module. |
| 4 | Then write to Anisia asking for Stripe details and weekly-event clarification from Zaria. |
| 5 | Only after that: QR full implementation, Stripe real integration, and remaining polish/UAT. |

