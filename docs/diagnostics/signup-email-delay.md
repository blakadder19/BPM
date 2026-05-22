# Signup confirmation-email delay — diagnostics runbook

User-reported symptom: signup confirmation emails take **10–15 minutes**
to arrive, blocking access before events/classes.

This document is the triage runbook for any future occurrence. It
also explains what the new `[signup]` log lines mean and what to do
with them.

> **Scope.** This is *diagnostics only*. The signup flow has not been
> redesigned, email confirmation has not been disabled, and the event
> purchase flow has not been touched. Once the data below identifies
> the bottleneck we can decide on a targeted fix.

---

## 0. The flow in one paragraph

`app/(auth)/signup/page.tsx` (client component) calls
`supabase.auth.signUp(...)` directly using the browser Supabase
wrapper (`lib/supabase/client.ts`). If `data.session` comes back the
user is auto-confirmed (email confirmation is OFF in that Supabase
project); otherwise the page navigates to `/signup?awaiting=1` and
shows the "Check your email" screen. **The confirmation email itself
is sent by Supabase Auth's SMTP relay** (configured under Supabase
Dashboard → Authentication → SMTP Settings — currently Brevo SMTP).
**BPM's own `BREVO_API_KEY` (used by `lib/communications/email-provider.ts`)
is NOT involved** in this email, so BPM-side `[email-provider]` logs
will never show it.

---

## 1. What the new logs look like

Every signup attempt now produces a short bracketed log stream tied
together by a `attemptId` (`s_<8 chars base36>`). The same attempt id
is also shown to the user as `Reference: s_xxxxxxxx` on the "Check
your email" screen — ask the user to share it.

A typical *successful* attempt (email confirmation ON):

```
[signup] start attemptId=s_a1b2c3d4 emailMasked=a***@gmail.com domain=gmail.com redirectOrigin=https://book.balancepowermotion.com ts=2026-05-22T09:41:02.413Z
[signup] attemptId=s_a1b2c3d4 supabase.signUp returned durationMs=842 hasUser=true hasSession=false confirmationRequired=true existingEmail=false redirectTarget=https://book.balancepowermotion.com/auth/callback
[perf signup] signUp=842ms attemptId=s_a1b2c3d4                     # dev only
[signup] attemptId=s_a1b2c3d4 confirmation email expected userId=… domain=gmail.com redirectTarget=… Email send is owned by Supabase Auth SMTP (NOT BPM/BREVO_API_KEY). See docs/diagnostics/signup-email-delay.md for triage.
```

If the user clicks **Resend confirmation email** on the waiting screen:

```
[signup] attemptId=s_a1b2c3d4 resend OK durationMs=613 domain=gmail.com redirectTarget=https://book.balancepowermotion.com/auth/callback
```

On error:

```
[signup] attemptId=s_a1b2c3d4 supabase.auth.signUp returned ERROR durationMs=412 code=… status=… message=…
[signup] attemptId=s_a1b2c3d4 resend ERROR durationMs=120 code=over_email_send_rate_limit status=429 message=…
```

### Privacy guarantees

The diagnostics deliberately never log:

* the full email address (only `maskEmail(...)` and `emailDomain(...)`),
* passwords / tokens / magic links,
* the full `emailRedirectTo` query string (we strip `?token_hash=…`
  via `safeRedirectTarget`),
* any Authorization header.

This is enforced by the helpers in
[`lib/utils/auth-diagnostics.ts`](../../lib/utils/auth-diagnostics.ts).

### How to read the logs

| Observation | Meaning | Next check |
| --- | --- | --- |
| `durationMs > 5000` on `supabase.signUp returned` | Supabase Auth itself was slow accepting the signup. | Check Supabase Status page + Auth Logs for the same window. |
| `durationMs < 2000` but user reports no email for 10 min | Signup was accepted fast → bottleneck is downstream: Supabase → SMTP, SMTP → Brevo, or Brevo → recipient. | Go to §3 (Supabase Auth Logs) and §4 (Brevo logs). |
| `hasUser=false hasSession=false` (no error) | Should not happen. Supabase changed behaviour or rate-limited silently. | Check Supabase Auth → Logs for the attempt. |
| `existingEmail=true` | Address already registered; **no confirmation email is sent**. UI shows "Account already exists". | Direct the user to **Set your password** flow. |
| `redirectOrigin=` is a preview URL (e.g. `*.vercel.app`) | The URL must be in **Auth → URL Configuration → Redirect URLs**, otherwise Supabase falls back to `site_url` and the confirm link is invalid. | Add the origin to the allow-list. |
| `confirmationRequired=true` followed by a fast `auto-confirmed` on a different env | Two environments disagree on the `enable_confirmations` setting. | Verify Supabase Auth Settings per environment. |

---

## 2. App-side: did the signup call itself take long?

The single most useful field is `durationMs` on the
`supabase.signUp returned` line. Get it via:

* Browser DevTools → Console — every `[signup]` line is emitted there.
  This is also where to ask the user for a screenshot (the reference
  code on the waiting screen matches the `attemptId` in the logs).
* Vercel function logs / server console — none of the `[signup]`
  lines are server-side today (`signUp` runs in the browser); only
  `[ensureProfile]` / `[provisionCurrentUser]` lines from the
  callback flow are server-side.

**Rule of thumb**: if `durationMs < 2000` on every attempt, the app
is not the bottleneck; jump to §3.

---

## 3. Supabase Auth — was the email actually generated?

1. Open **Supabase Dashboard → your project → Authentication → Logs**.
2. Filter by event type `user.signup` (or scroll to the timestamp you
   captured in the `ts=...` field of the start log).
3. For the row matching the user id from
   `confirmation email expected userId=…`:
   * Verify the `signup` event timestamp matches the app log
     timestamp within a few hundred ms.
   * Open the row and look for an associated SMTP send. The row
     should show `mail.signup.sent` or an SMTP error.
4. Also open **Authentication → Settings → SMTP Settings**:
   * Confirm **Enable Custom SMTP** is on and points at
     `smtp-relay.brevo.com:587`.
   * Confirm **Sender email** matches a verified Brevo sender.
   * Confirm rate limit (e.g. `Rate limit for sending emails`) is not
     1/hour or similar pathological value.
5. Also open **Authentication → URL Configuration**:
   * Confirm the production origin (e.g.
     `https://book.balancepowermotion.com`) and any preview origin
     used by testers are in **Redirect URLs**.

**Interpretation:**

* SMTP error visible in Supabase Logs → bottleneck is the
  **Supabase → Brevo handoff** (SMTP credentials, sender not verified,
  Brevo SMTP IP throttling).
* No SMTP error and timestamp close to the app log → Supabase Auth
  is fine; jump to §4.

---

## 4. Brevo — was the email delivered?

1. Open **Brevo Dashboard → Transactional → Email → Logs**.
2. Search the recipient email (or filter by sending IP if working
   from masked logs).
3. For the matching message look at:
   * **Accepted** timestamp — Brevo received the email from Supabase
     SMTP.
   * **Delivered** timestamp — Brevo handed it to the recipient MTA.
   * **Status** — `delivered`, `deferred`, `bounced`, `rejected`,
     `blocked`.
4. Specifically scan for:
   * `deferred` with reason `421 4.7.0` / greylisting — recipient
     ISP throttling; expect 5–15 minutes delay.
   * `sender_not_authorized` / DKIM / SPF failures — Brevo refused
     to send because the sending domain isn't authenticated.
   * Rate-limit messages on the Brevo plan.

**Interpretation:**

* **Accepted instantly but delivered 10–15 min later** → bottleneck
  is the **recipient ISP** (greylisting is the most common cause —
  fixing it requires upgrading the Brevo sender reputation / setting
  up DKIM/SPF/DMARC for the sending domain). The BPM app cannot
  shorten this delay; we can only make the UX clearer (already
  done — see §5).
* **Not in Brevo Logs at all** → the email never left Supabase's
  SMTP relay. Bottleneck is upstream — re-read §3 carefully and
  check Supabase rate limits.
* **`bounced` or `rejected`** → recipient address is invalid /
  blocked. UI already handles this implicitly (the user thinks they
  signed up but no email ever arrives); a future fix could surface a
  `bounce` webhook from Brevo.

---

## 5. UX safety nets already in place

The "Check your email" screen now:

1. Shows the masked recipient (`a***@gmail.com`) so the user
   immediately spots a typo.
2. Tells them it "can take a few minutes" and to check **spam or
   promotions**.
3. Offers a **Resend confirmation email** button (60-second
   client-side cooldown; Supabase still rate-limits server-side).
4. Shows a small `Reference: s_xxxxxxxx` code so support can match
   the user to the `[signup]` log lines.

None of these are themselves a fix for the delay — they exist so
users stop assuming the email failed during a normal SMTP delay and
so support can quickly correlate reports to logs.

---

## 6. Optional: trigger a measured test signup

To capture a clean baseline from a known mailbox:

1. Open the production site in a private browsing window.
2. Open DevTools → Console; clear it; filter for `[signup]`.
3. Sign up with a real mailbox you control (`yourname+sigtest-<n>@…`).
4. Note the `attemptId` and `durationMs`.
5. Immediately note the time, then time-watch:
   * Supabase Auth Logs for the `signup` event timestamp.
   * Brevo Transactional Logs for `accepted` and `delivered`
     timestamps.
   * Your inbox for the arrival timestamp.
6. Subtract to get the four deltas:
   * `signUp() return → Supabase SMTP handoff`
   * `Supabase handoff → Brevo accepted`
   * `Brevo accepted → Brevo delivered`
   * `Brevo delivered → inbox visible`

The largest delta is the bottleneck. Do not automate this in CI; it
creates real auth users.

---

## 7. What this audit does NOT do (and why)

| Not done | Reason |
| --- | --- |
| Switch the confirmation email to a BPM-sent Brevo API email. | Would bypass Supabase Auth's verification token machinery; large surface, easy to break. Only consider after data shows Supabase SMTP is the bottleneck. |
| Disable email confirmation. | Security regression; out of scope. |
| Auto-resend after N seconds. | Until we know the delay source, this just multiplies the queue. |
| Move signup to a server action. | The same `signUp` RPC would run; would not change SMTP timing. |

Revisit any of the above only with concrete data from §3 and §4.
