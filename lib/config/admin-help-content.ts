export interface HelpVisual {
  title: string;
  imageSrc: string;
  alt: string;
  caption?: string;
}

export interface HelpSection {
  heading: string;
  items: string[];
  visualKey?: string;
}

export interface AdminHelpEntry {
  title: string;
  intro: string;
  sections: HelpSection[];
  visuals?: HelpVisual[];
}

const HELP: Record<string, AdminHelpEntry> = {
  /* ────────────────────────────────────────────────────────────── */
  /*  DASHBOARD                                                    */
  /* ────────────────────────────────────────────────────────────── */
  dashboard: {
    title: "Dashboard",
    intro:
      "Your daily operations overview. Start here each day to see what needs attention before classes begin.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Gives you a snapshot of today's classes, bookings, and capacity.",
          "Shows key numbers like upcoming bookings, active waitlists, and unresolved penalties.",
          "Highlights demand trends, role balance, and attendance patterns so you can plan ahead.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Check the dashboard at the start of each day before classes begin.",
          "Review the KPI cards at the top — each one links to the relevant page.",
          "Scroll down to see role balance for partner dance classes, attendance rates, and booking trends by weekday.",
          "If a class looks under-enrolled, check if it needs promotion or teacher adjustments.",
          "If waitlist numbers are high, consider opening additional capacity.",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "Dashboard numbers update when you load the page — refresh if something looks stale.",
          "Demand data shows fill rates from actual bookings, not predictions.",
          "The Unresolved Penalties card links directly to the Penalties page for resolution.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Ignoring high waitlist counts — check if spots can be opened.",
          "Assuming the dashboard replaces checking attendance — always verify in-person.",
          "Not refreshing before making decisions based on capacity numbers.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  BOOKINGS                                                     */
  /* ────────────────────────────────────────────────────────────── */
  bookings: {
    title: "Bookings",
    intro:
      "Manage all student class bookings, waitlist entries, and cancellations. This is the primary place to handle booking-related admin tasks — not attendance.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "View all class bookings across all students in one place.",
          "Filter by status, class, student, role, source, or date to find specific bookings.",
          "Cancel, restore, check in, or create bookings on behalf of students.",
          "See waitlist positions and manage promotions when spots open up.",
          "Investigate booking issues — who booked, when, through which subscription, and what happened.",
        ],
        visualKey: "bookings/filter-bar",
      },
      {
        heading: "How to use it",
        items: [
          "Start by filtering — use Status to see only active bookings, or Upcoming Only to exclude past classes.",
          "Click any booking row to expand it. The detail panel shows the booking source, linked subscription, and available actions.",
          "To cancel a booking, expand the row and use Cancel. The student's credit is released automatically.",
          "To restore a cancelled booking, expand it and use Restore. It re-books if a spot is available, or adds to the waitlist.",
          "Use the Check In button as a shortcut to mark a student as present for that class.",
          "Use the New Booking button to create a booking on behalf of a student — for example, for walk-ins or phone reservations.",
          "If something looks wrong, check the booking source (Student, Admin, Walk-in, Waitlist Promo) for context.",
        ],
        visualKey: "bookings/row-example",
      },
      {
        heading: "Important rules",
        items: [
          "Booking status and attendance status are different systems. Booking tracks the reservation; attendance tracks what happened on class day.",
          "Cancelling a booking does NOT record attendance. A cancelled booking and an absent student are different things.",
          "Socials are not bookable and do not appear on this page.",
          "Late cancellations (inside the cutoff window) and no-shows may generate penalties automatically.",
          "Restoring a booking uses the student's existing subscription — ensure they still have credits.",
          "Admin-created bookings are tagged with source 'Admin' for audit purposes.",
        ],
        visualKey: "bookings/status-guide",
      },
      {
        heading: "Common mistakes",
        items: [
          "Confusing booking status with attendance — a Confirmed booking does not mean the student attended.",
          "Cancelling a booking instead of marking absent — cancel removes the reservation; absent records non-attendance on the Attendance page.",
          "Forgetting to check the waitlist after a cancellation — the next waitlisted student should be promoted.",
          "Creating duplicate bookings for the same student and class — check if they already have one.",
          "Restoring a booking when the student's subscription has expired — verify their subscription status first.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  ATTENDANCE                                                   */
  /* ────────────────────────────────────────────────────────────── */
  attendance: {
    title: "Attendance",
    intro:
      "Record what actually happened on class day. Attendance is about who showed up — not who booked. Always take attendance for every class.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Mark each student as Present, Late, Absent, or Excused for every class.",
          "Record walk-in students who attend without a prior booking.",
          "Check students in using the QR scanner as they arrive at the studio.",
          "Review historical attendance records using the History tab.",
          "Identify students with recurring no-shows or late patterns.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Open the Attendance page — it defaults to the Today's Classes tab, which shows all of today's classes.",
          "Each class appears as a block, with all booked students listed underneath.",
          "Tap a status button next to each student name to set their attendance. The active status highlights.",
          "If a student arrives without a booking (walk-in), use the Add Record button to create an attendance entry manually.",
          "Switch to the QR Scan tab to check students in by scanning their phone QR code as they enter.",
          "Use the History tab when you need to look up past attendance — filter by class, date, or student name.",
          "After class, review any unmarked students. Unchecked students may be auto-closed as missed depending on your settings.",
        ],
        visualKey: "attendance/class-block",
      },
      {
        heading: "Important rules",
        items: [
          "Attendance is separate from bookings — a booked student still needs to be marked when they arrive.",
          "Present: student attended normally. Credit is consumed.",
          "Late: arrived after class started but still attended. Credit is consumed. No penalty.",
          "Absent: did not show up. May trigger a no-show penalty. Credit refund depends on your absence policy settings.",
          "Excused: notified in advance. No penalty applies. Credit is always refunded.",
          "The attendance closure window (set in Settings) determines how long after class start unmarked students remain before auto-closure.",
        ],
        visualKey: "attendance/status-meanings",
      },
      {
        heading: "Common mistakes",
        items: [
          "Forgetting to take attendance — it will not fill itself in automatically.",
          "Marking a student as Absent when they actually cancelled their booking — those are different actions with different consequences.",
          "Not recording walk-ins — they still need to be tracked for capacity, records, and potential credit deduction.",
          "Taking attendance for the wrong date or class — always double-check the class header before marking.",
          "Leaving students unmarked and assuming the system will figure it out — review and close each class properly.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  PRODUCTS                                                     */
  /* ────────────────────────────────────────────────────────────── */
  products: {
    title: "Products",
    intro:
      "Products are what students buy to access classes. There are three types: memberships, class packs, and drop-ins. Each type works differently.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Create and manage the products available in the student catalog.",
          "Set pricing, class limits, term bindings, and style restrictions for each product.",
          "Control which dance styles a product grants access to.",
          "Activate or deactivate products to control student-facing visibility.",
          "See how many active subscriptions each product has.",
        ],
        visualKey: "products/type-guide",
      },
      {
        heading: "How to use it",
        items: [
          "Click any product row to expand it and see full details — class limits, term binding, style restrictions, and subscription count.",
          "Use the Edit button inside the expanded row to change pricing, description, or access rules.",
          "Use the Deactivate/Activate toggle to control whether the product appears in the student catalog.",
          "Create new products with the Add Product button — choose the type first, then fill in the details.",
          "Filter by type (Membership, Pass, Drop-in) or active status to narrow the list.",
          "When a product has active subscriptions, deactivating it only hides it from new purchases — existing subscriptions continue working.",
        ],
        visualKey: "products/row-example",
      },
      {
        heading: "Important rules",
        items: [
          "Memberships give access for an entire term. They may be unlimited or have a class limit (e.g. 8 classes per term).",
          "Class packs are credit-based. Each booking uses one credit regardless of term. Credits don't expire based on terms.",
          "Drop-ins are single-use — one purchase, one class. Good for first-timers or occasional visitors.",
          "Term-bound products are linked to a specific term. When purchasing, students choose the current or next term, but the current term is only available during its first 2 weeks.",
          "Style restrictions control which dance styles a product covers. Unrestricted products work for any class.",
          "Promo passes (e.g. Beginners 1+2) have special configurations — check their restrictions carefully before editing.",
        ],
        visualKey: "products/restrictions",
      },
      {
        heading: "Common mistakes",
        items: [
          "Creating a product without setting the correct term binding — students may end up purchasing for the wrong term.",
          "Forgetting to set style restrictions — an unrestricted product allows booking into any class, which may not be intended.",
          "Editing a product's class limit after students have purchased — this can cause confusion about remaining credits.",
          "Deactivating a product and expecting active subscriptions to stop — they continue until their term or credits expire.",
          "Setting the wrong price — always double-check before publishing to the catalog.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  TERMS                                                        */
  /* ────────────────────────────────────────────────────────────── */
  terms: {
    title: "Terms",
    intro:
      "Terms are 4-week blocks that define the academy's commercial cycle. Most memberships, class schedules, and enrollment windows are organized around terms.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Create and manage academy terms with start and end dates.",
          "See which term is currently active, which is upcoming, and which are past.",
          "Plan future terms so students always have something to purchase for.",
          "Track the current week number within the active term.",
        ],
        visualKey: "terms/list-example",
      },
      {
        heading: "How to use it",
        items: [
          "Plan ahead — create the next term before the current one reaches its midpoint (week 2).",
          "Set dates carefully. Each term should be exactly 4 weeks (28 days).",
          "The active term is determined automatically by today's date — you don't set it manually.",
          "Past terms remain in the list for reference. Do not delete them — they are linked to student subscriptions and records.",
          "When creating a new term, choose a name that makes it easy for staff and students to identify (e.g. 'Term 4 — Summer 2026').",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "BPM runs on 4-week terms. Each term is a 28-day block.",
          "Students can only join the current term during its first 2 weeks. After week 2, they should choose the next term.",
          "Term-bound products (memberships) are linked to one specific term — the student picks the term at purchase time.",
          "Changing a term's dates after students have purchased products for it can cause confusion. Avoid this unless truly necessary.",
          "There should always be a visible upcoming term so students can plan and purchase ahead.",
        ],
        visualKey: "terms/timeline",
      },
      {
        heading: "Common mistakes",
        items: [
          "Creating overlapping terms — start and end dates must not conflict with other terms.",
          "Forgetting to create the next term before the midpoint of the current one — students will have nothing to buy for.",
          "Setting incorrect dates (not 28 days) — this breaks the current/next term logic and week number display.",
          "Deleting a term that has active subscriptions linked to it — this breaks student records.",
          "Not naming terms clearly — vague names cause confusion for both staff and students.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  SCHEDULE                                                     */
  /* ────────────────────────────────────────────────────────────── */
  schedule: {
    title: "Schedule",
    intro:
      "Manage dated class instances — the actual classes that appear on specific dates. Instances can be generated from templates, created manually, or copied from a previous month.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "View all scheduled class instances across dates.",
          "Create, edit, cancel, or delete individual instances.",
          "Generate instances in bulk from templates for upcoming weeks.",
          "Copy a previous month's entire schedule forward into the next period.",
          "Override teacher assignments for specific instances.",
          "Track capacity, bookings, and waitlists for each instance.",
        ],
        visualKey: "schedule/actions-bar",
      },
      {
        heading: "How to use it",
        items: [
          "Switch between Table, Weekly, and Monthly views depending on what you need to see.",
          "Filter by date range, class type, style, location, or status to find specific instances.",
          "Click any row to expand it — you'll see details including bookings, teacher assignments, and available actions.",
          "To set up a new week or month: use Bulk Create to generate instances from active templates, or Copy Previous Month to duplicate the last period.",
          "To add a one-off class: use Add Instance for a single manually scheduled class.",
          "To change teachers for a specific class: expand the instance and use the Teachers override.",
          "To cancel a class: expand it and use Cancel Instance. This will notify booked students and release their credits.",
        ],
        visualKey: "schedule/row-example",
      },
      {
        heading: "Important rules",
        items: [
          "Instances are independent from templates — editing a template does NOT change instances that already exist.",
          "Cancelling an instance will notify booked students and release their credits automatically.",
          "Socials and Student Practice instances appear in the schedule but follow different bookability rules.",
          "Teacher assignments on an instance override the default pair from the template for that specific date.",
          "Bulk Create and Copy Month can create duplicates if the target period already has instances — always check first.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Generating the schedule twice for the same period — check for existing instances before generating.",
          "Editing an instance after students have booked without reviewing the impact panel first.",
          "Cancelling an instance instead of rescheduling it — cancelled classes cannot be reopened.",
          "Forgetting to assign teachers before class day — students and staff need to know who's teaching.",
          "Assuming that changing a template updates existing instances — it does not. Templates only affect future generation.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  CLASS TEMPLATES                                              */
  /* ────────────────────────────────────────────────────────────── */
  templates: {
    title: "Class Templates",
    intro:
      "Templates define the recurring weekly class structure. Each template represents a class that repeats at the same time and day each week.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Define and manage the academy's weekly class lineup.",
          "Set the day, time, style, level, capacity, and location for each recurring class.",
          "Assign default teacher pairs to templates.",
          "Control which templates are active and used for schedule generation.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Click a template row to expand its details, including linked instances.",
          "Use the edit button to change class details like time, capacity, or style.",
          "Toggle active/inactive to control whether the template is used when generating the schedule.",
          "Create new templates with the Add Template button.",
          "Filter by day, type, style, or status to find specific templates.",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "Templates define the blueprint — actual classes are schedule instances.",
          "Editing a template does not change instances that were already generated.",
          "Deactivating a template prevents future generation but does not remove existing instances.",
          "Role balance badges appear based on the styles selected in Settings.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Editing a template and expecting past instances to update — they won't.",
          "Creating a duplicate template for the same slot (same day, time, location).",
          "Forgetting to set capacity — a template without capacity allows unlimited bookings.",
          "Deactivating a template without realising it stops future schedule generation for that class.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  STUDENTS                                                     */
  /* ────────────────────────────────────────────────────────────── */
  students: {
    title: "Students",
    intro:
      "The student directory. View and manage student profiles, subscriptions, bookings, penalties, and account status — all from one place.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Browse the full student list with contact info, dance role, and subscription status.",
          "Expand any student to see their full detail panel — subscriptions, upcoming bookings, penalties, and wallet balance.",
          "Create, edit, activate, or deactivate student accounts.",
          "Add or edit subscriptions for individual students.",
          "Run the Term Lifecycle check to process expired or renewable subscriptions.",
        ],
        visualKey: "students/filters",
      },
      {
        heading: "How to use it",
        items: [
          "Click any student row to expand their detail panel. This is the fastest way to check a student's full status.",
          "When a student reports an issue, check their subscriptions first — most problems come from expired or exhausted credits.",
          "Use the edit button to update a student's name, phone number, dance role, or other profile info.",
          "Use Add Student for manual registration — for walk-ins who sign up at reception.",
          "Use the Term Lifecycle button to batch-process subscription expirations and renewals. Run this at least once per term transition.",
          "Filter by role (Leader/Follower), active status, or subscription status to narrow the list.",
          "Use search to find students by name or email quickly.",
        ],
        visualKey: "students/list-example",
      },
      {
        heading: "Important rules",
        items: [
          "Deactivating a student prevents them from logging in, but keeps all their records intact.",
          "Subscriptions are managed inside each student's expanded detail panel — not from the Products page.",
          "The Term Lifecycle check only processes subscriptions that are due. It does not touch active, healthy subscriptions.",
          "Students can have multiple active subscriptions (e.g. a Bachata membership and a Salsa drop-in).",
          "Deleting a student permanently removes all their history. Always prefer deactivation unless the record was created in error.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Deleting a student instead of deactivating — deletion removes all booking, attendance, and penalty history permanently.",
          "Forgetting to run Term Lifecycle at the start of a new term — expired subscriptions won't clean up automatically unless the cron job is active.",
          "Editing a subscription's term without understanding the impact — this can move a student between terms unexpectedly.",
          "Adding a duplicate student instead of searching for the existing one — always search first.",
          "Not checking subscription status when a student says they can't book — it's the most common root cause.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  PENALTIES                                                    */
  /* ────────────────────────────────────────────────────────────── */
  penalties: {
    title: "Penalties",
    intro:
      "Track and manage penalties generated by late cancellations and no-shows. Penalties are fees — they do not block students from booking.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "View all penalties across students with their reason, amount, and resolution status.",
          "Resolve penalties (mark as paid), waive them, or reopen them.",
          "Add manual penalties when needed.",
          "Track the total unresolved penalty amount.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Click a penalty row to expand and see its full details.",
          "Use the action buttons to Resolve, Waive, or Reopen a penalty.",
          "Filter by reason (Late Cancel / No-show) or resolution status to find specific penalties.",
          "Use Add Penalty to create a manual penalty for a student.",
          "Use the search to find penalties by student name or class.",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "Penalties are informational fees — they do not prevent students from booking.",
          "Late cancel and no-show fees are set in Settings.",
          "Penalties only apply to class bookings — socials are always excluded.",
          "Waiving a penalty means it's forgiven. Resolving means it's been paid or settled.",
          "Penalties are generated automatically based on attendance and cancellation timing.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Resolving a penalty before the student has actually paid.",
          "Waiving penalties inconsistently — apply the same policy to all students.",
          "Expecting penalties to block bookings — they are tracking only, not enforcement.",
          "Not reviewing unresolved penalties regularly — they can accumulate.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  SETTINGS                                                     */
  /* ────────────────────────────────────────────────────────────── */
  settings: {
    title: "Settings",
    intro:
      "Academy-wide configuration. Changes here affect how penalties, bookings, attendance, and terms behave across the entire system.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Configure penalty fees and rules (late cancel, no-show amounts and toggles).",
          "Set which dance styles require leader/follower role balance.",
          "Control class availability rules (socials, weekly events, student practice bookability).",
          "Configure attendance and check-in behavior (closure window, QR check-in, self check-in).",
          "Set term-bound policy rules (late entry, student term selection).",
          "Manage admin alert preferences.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Each card controls a different area of the system. Make your changes across cards, then click Save at the bottom.",
          "Penalty fees are entered in cents (e.g. 200 = €2.00).",
          "Check or uncheck dance styles under Role Balance to control which styles show balance indicators.",
          "Toggle attendance options like QR check-in or self check-in under Attendance & Check-In.",
          "Changes take effect immediately after saving.",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "Changing penalty amounts only affects future penalties — existing ones keep their original amount.",
          "Disabling penalty toggles stops future penalties from being created, but does not remove existing ones.",
          "Class availability toggles control display labels — booking enforcement follows separate rules.",
          "The waitlist offer expiry setting is saved but not yet actively enforced.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Entering fee amounts in euros instead of cents (200 means €2.00, not €200).",
          "Changing settings mid-term without considering the impact on active students.",
          "Assuming that toggling a setting retroactively changes past records — it doesn't.",
          "Forgetting to click Save after making changes.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  STUDIO HIRE                                                  */
  /* ────────────────────────────────────────────────────────────── */
  "studio-hire": {
    title: "Studio Hire",
    intro:
      "Manage external studio rental enquiries and bookings. Track enquiry status, deposits, and scheduling conflicts.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Create and manage studio hire enquiries and confirmed bookings.",
          "Track the lifecycle from enquiry → confirmed → completed or cancelled.",
          "View bookings in table or calendar view.",
          "Check for scheduling conflicts with existing classes or other hires.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Use the New Enquiry button to record an incoming hire request.",
          "Click a booking row to expand its details — contact info, dates, notes, and deposit status.",
          "Update the status as the enquiry progresses (Enquiry → Confirmed → Completed).",
          "Switch to Calendar view to see hires alongside the studio schedule.",
          "Filter by status, booking type, or search by name to find specific records.",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "Studio hire is separate from class scheduling — hire bookings don't block class instances automatically.",
          "Always check for conflicts before confirming a studio hire.",
          "Deposits and cancellation fees are tracked per booking.",
          "Overnight bookings span two calendar days — the system handles this correctly.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Confirming a hire without checking for class schedule conflicts.",
          "Forgetting to update the status after the event — completed hires should be marked as such.",
          "Not recording the deposit amount — this makes financial tracking difficult.",
          "Deleting an enquiry instead of cancelling it — cancelled records are kept for reference.",
        ],
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────── */
  /*  SPECIAL EVENTS                                               */
  /* ────────────────────────────────────────────────────────────── */
  events: {
    title: "Special Events",
    intro:
      "Manage guest artist weekends, workshops, socials, bootcamps, and other special events that run outside the normal weekly timetable.",
    sections: [
      {
        heading: "What this page is for",
        items: [
          "Create and manage special events that are separate from the regular class schedule.",
          "Each event can contain multiple sessions (workshops, socials, masterclasses) and multiple purchasable products (passes, tickets).",
          "Event products are independent from the standard BPM catalog — they do not create memberships or subscriptions.",
          "Students browse published events, see the schedule, and purchase tickets or passes directly.",
        ],
      },
      {
        heading: "How to use it",
        items: [
          "Start by creating an event with a title, dates, and location. It starts as a draft.",
          "Add sessions to the event — each workshop, social, or intensive gets its own entry with date, time, teacher, and capacity.",
          "Add products — define what students can buy (Full Pass, Weekend Pass, Single Workshop, Social Ticket, etc.).",
          "For each product, set the inclusion rule: does it cover all sessions, selected sessions, all workshops, or socials only?",
          "When ready, set the event status to Published, toggle Visible and Sales Open, and students will see it.",
          "Use the Manage link on each event to view and edit its full details, sessions, products, and purchases.",
        ],
      },
      {
        heading: "Important rules",
        items: [
          "A Full Pass gives broad access but does NOT mean the student attended all sessions — attendance is recorded separately.",
          "Buying a pass does not create per-session reservations. Staff decide on-site who enters based on capacity.",
          "Session capacities are for staff reference. The system does not block purchases based on capacity in this version.",
          "Event products and purchases are completely separate from normal memberships, passes, and subscriptions.",
          "Students use their existing QR code for identity — no event-specific QR is needed.",
          "Draft events are not visible to students. Only published + visible events appear in the student view.",
        ],
      },
      {
        heading: "Common mistakes",
        items: [
          "Forgetting to toggle Sales Open after publishing — students can see the event but cannot purchase.",
          "Not setting the inclusion rule correctly — a Combo Pass with 'All sessions' gives more access than intended.",
          "Assuming a Full Pass purchase means the student attended everything — check attendance separately.",
          "Deleting a product that already has purchases — the purchases remain but the product reference is lost.",
        ],
      },
    ],
  },
};

export function getAdminHelp(pageKey: string): AdminHelpEntry | null {
  return HELP[pageKey] ?? null;
}

export function getAdminHelpKeys(): string[] {
  return Object.keys(HELP);
}
