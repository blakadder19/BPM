/**
 * Phase 17 — delivery behaviour and permission gating for the
 * "Event ticket holders" broadcast audience.
 *
 * The behaviour that matters and cannot be seen from the resolver
 * tests:
 *
 *   * "Both" sends in-app ONLY to linked students, but email to
 *     everyone including guests;
 *   * guests are emailed at the address that travelled with them,
 *     not via an account lookup (they have no account);
 *   * an in-app-only broadcast to a guest-only audience is refused
 *     rather than silently delivering to nobody;
 *   * an unauthorised caller is rejected before anything is read;
 *   * the send summary records the event identity and the counts.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── Permission gate ─────────────────────────────────────────
let authorised = true;
vi.mock("@/lib/staff-permissions", () => ({
  requireSuperAdmin: vi.fn(async () => {
    if (!authorised) throw new Error("Forbidden: super admin required");
    return { user: { id: "admin-1", email: "admin@bpm.ie", fullName: "Admin One" } };
  }),
}));

// ── Audience (stubbed; resolution itself is tested elsewhere) ──
type Audience = {
  students: { id: string; name: string }[];
  guests: { email: string; name: string }[];
  ticketHolders?: unknown;
};
let AUDIENCE: Audience = { students: [], guests: [] };

vi.mock("@/lib/services/broadcast-audience", () => ({
  resolveAudience: vi.fn(async () => AUDIENCE),
  audienceTotal: (a: Audience) => a.students.length + a.guests.length,
}));

// ── Supabase admin client ───────────────────────────────────
let BROADCAST_ROW: Record<string, unknown> = {};
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: BROADCAST_ROW, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/academy", () => ({
  getAcademyId: async () => "academy-1",
}));

// ── Email provider (spy) ────────────────────────────────────
const emailsSent: { to: string; subject: string }[] = [];
let emailEnabled = true;
let emailShouldFail = false;

vi.mock("@/lib/communications/email-provider", () => ({
  isEmailEnabled: () => emailEnabled,
  sendEmail: vi.fn(async ({ to, subject }: { to: string; subject: string }) => {
    if (emailShouldFail) return false;
    emailsSent.push({ to, subject });
    return true;
  }),
}));

vi.mock("@/lib/communications/email-templates", () => ({
  buildEmailContent: () => ({ subject: "Latin Legends Vol.2 — update", html: "<p>hi</p>" }),
}));

vi.mock("@/lib/communications/email-resolver", () => ({
  resolveStudentEmail: vi.fn(async (id: string) => `${id}@students.example.com`),
}));

// ── In-app dispatch (spy) ───────────────────────────────────
const inAppSaved: string[] = [];
const dispatched: string[] = [];

vi.mock("@/lib/communications/notification-store", () => ({
  saveGenericNotificationToDB: vi.fn(async (e: { studentId: string }) => {
    inAppSaved.push(e.studentId);
  }),
  hasNotificationWithKey: vi.fn(async () => false),
}));

vi.mock("@/lib/communications/dispatch", () => ({
  dispatchCommEvents: vi.fn(async (events: { studentId: string }[]) => {
    for (const e of events) dispatched.push(e.studentId);
    return { sent: events.length };
  }),
}));

vi.mock("@/lib/utils/is-real-user", () => ({
  isRealUser: () => true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { sendBroadcastAction } from "../broadcasts";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "bc-1",
    title: "Latin Legends Vol.2 is cancelled",
    body: "Unfortunately the event is cancelled. Refunds are being processed.",
    channels: ["email"],
    audience_type: "event_ticket_holders",
    audience_params: { eventId: "evt-latin-legends-2", ticketHolderStatus: "all" },
    status: "draft",
    image_url: null,
    cta_label: null,
    cta_url: null,
    cta_destination_type: null,
    cta_destination_id: null,
    category: null,
    ...over,
  };
}

const TICKET_HOLDERS = {
  eventId: "evt-latin-legends-2",
  eventName: "Latin Legends Vol.2",
  eventDate: "2026-10-04",
  recipients: [],
  stats: {
    totalRecipients: 3,
    linkedStudentCount: 1,
    guestCount: 2,
    excludedUnpaidCount: 4,
    excludedNoEmailCount: 1,
    duplicatesCollapsed: 7,
  },
};

beforeEach(() => {
  authorised = true;
  emailEnabled = true;
  emailShouldFail = false;
  emailsSent.length = 0;
  inAppSaved.length = 0;
  dispatched.length = 0;
  updates.length = 0;
  BROADCAST_ROW = row();
  AUDIENCE = {
    students: [{ id: "s-1", name: "Ann Doe" }],
    guests: [
      { email: "guest1@example.com", name: "Guest One" },
      { email: "guest2@example.com", name: "Guest Two" },
    ],
    ticketHolders: TICKET_HOLDERS,
  };
});

// ── Permission ──────────────────────────────────────────────

describe("permission gate", () => {
  it("rejects an unauthorised caller", async () => {
    authorised = false;
    await expect(sendBroadcastAction("bc-1")).rejects.toThrow(/super admin/i);
    // Nothing was delivered or written.
    expect(emailsSent).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

// ── Email-only ──────────────────────────────────────────────

describe("email channel", () => {
  it("emails linked students AND guest ticket holders", async () => {
    const res = await sendBroadcastAction("bc-1");

    expect(res.success).toBe(true);
    const to = emailsSent.map((e) => e.to).sort();
    expect(to).toEqual([
      "guest1@example.com",
      "guest2@example.com",
      "s-1@students.example.com",
    ]);
    // Guests never receive an in-app notification.
    expect(inAppSaved).toHaveLength(0);
  });

  it("reports the recipient count across students and guests", async () => {
    const res = await sendBroadcastAction("bc-1");
    expect(res.recipientCount).toBe(3);
    expect(res.emailSentCount).toBe(3);
  });

  it("counts guest email failures without aborting the send", async () => {
    emailShouldFail = true;
    const res = await sendBroadcastAction("bc-1");
    expect(res.success).toBe(true);
    const summary = updates[0].send_summary as Record<string, unknown>;
    expect(summary.emailFailedCount).toBe(2);
  });

  it("skips guests gracefully when the email provider is unconfigured", async () => {
    emailEnabled = false;
    const res = await sendBroadcastAction("bc-1");
    expect(res.success).toBe(true);
    expect(emailsSent).toHaveLength(0);
  });
});

// ── Both channels ───────────────────────────────────────────

describe('"Both" channel split', () => {
  beforeEach(() => {
    BROADCAST_ROW = row({ channels: ["in_app", "email"] });
  });

  it("sends in-app ONLY to the linked student but email to the guests too", async () => {
    await sendBroadcastAction("bc-1");

    // In-app went through the standard dispatcher, students only.
    expect(dispatched).toEqual(["s-1"]);
    // Guests got email directly.
    expect(emailsSent.map((e) => e.to).sort()).toEqual([
      "guest1@example.com",
      "guest2@example.com",
    ]);
  });

  it("counts every recipient exactly once", async () => {
    const res = await sendBroadcastAction("bc-1");
    expect(res.recipientCount).toBe(3);
  });
});

// ── In-app only ─────────────────────────────────────────────

describe("in-app only", () => {
  it("refuses a guest-only audience rather than delivering to nobody", async () => {
    BROADCAST_ROW = row({ channels: ["in_app"] });
    AUDIENCE = {
      students: [],
      guests: [{ email: "guest1@example.com", name: "Guest One" }],
      ticketHolders: TICKET_HOLDERS,
    };

    const res = await sendBroadcastAction("bc-1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only be reached by email/i);
    expect(updates).toHaveLength(0);
  });

  it("still delivers in-app to linked students, silently skipping guests", async () => {
    BROADCAST_ROW = row({ channels: ["in_app"] });
    const res = await sendBroadcastAction("bc-1");

    expect(res.success).toBe(true);
    expect(inAppSaved).toEqual(["s-1"]);
    expect(emailsSent).toHaveLength(0);
  });
});

// ── Guard rails + audit ─────────────────────────────────────

describe("guard rails", () => {
  it("refuses an empty audience", async () => {
    AUDIENCE = { students: [], guests: [] };
    const res = await sendBroadcastAction("bc-1");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no matching recipients/i);
  });

  it("refuses to send the same broadcast twice", async () => {
    BROADCAST_ROW = row({ status: "sent" });
    const res = await sendBroadcastAction("bc-1");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already been sent/i);
  });
});

describe("send summary audit", () => {
  it("records the audience type, event identity and resolved counts", async () => {
    await sendBroadcastAction("bc-1");

    expect(updates).toHaveLength(1);
    const summary = updates[0].send_summary as Record<string, unknown>;
    expect(summary).toMatchObject({
      audienceType: "event_ticket_holders",
      eventId: "evt-latin-legends-2",
      eventName: "Latin Legends Vol.2",
      eventDate: "2026-10-04",
      ticketHolderStatus: "all",
      resolvedRecipientCount: 3,
      linkedStudentCount: 1,
      guestCount: 2,
      excludedUnpaidCount: 4,
      excludedNoEmailCount: 1,
      duplicatesCollapsed: 7,
      emailSentCount: 3,
    });
    expect(typeof summary.sentAt).toBe("string");
  });

  it("marks the broadcast as sent with the recipient counts", async () => {
    await sendBroadcastAction("bc-1");
    expect(updates[0]).toMatchObject({
      status: "sent",
      recipient_count: 3,
      email_sent_count: 3,
    });
  });

  it("omits event keys for a non-event audience", async () => {
    BROADCAST_ROW = row({ audience_type: "all_students", audience_params: {} });
    AUDIENCE = { students: [{ id: "s-1", name: "Ann Doe" }], guests: [] };

    await sendBroadcastAction("bc-1");

    const summary = updates[0].send_summary as Record<string, unknown>;
    expect(summary.audienceType).toBe("all_students");
    expect(summary.eventId).toBeUndefined();
    expect(summary.guestCount).toBe(0);
  });
});
