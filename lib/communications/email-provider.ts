import "server-only";

/**
 * Lightweight email sender using the Brevo Transactional Email API (v3).
 * Uses plain fetch — no npm dependency required.
 *
 * If BREVO_API_KEY is not set, all sends are silently skipped
 * so the app never crashes due to missing email config.
 *
 * Brevo is also used for Supabase Auth emails via custom SMTP —
 * see supabase/config.toml and the setup documentation for details.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface BrevoConfig {
  apiKey: string;
  senderName: string;
  senderEmail: string;
}

function getConfig(): BrevoConfig | null {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  const fromRaw = process.env.EMAIL_FROM_ADDRESS ?? "BPM Studio <no-reply@balancepowermotion.com>";
  const match = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
  const senderName = match?.[1]?.trim() ?? "BPM";
  const senderEmail = match?.[2]?.trim() ?? fromRaw;

  return { apiKey, senderName, senderEmail };
}

export function isEmailEnabled(): boolean {
  return !!process.env.BREVO_API_KEY;
}

/**
 * Send a single transactional email via Brevo.
 * Returns true on success, false on failure (never throws).
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    console.warn(`[email-provider] BREVO_API_KEY not configured — cannot send to ${payload.to}.`);
    return false;
  }

  console.info(`[email-provider] Sending to=${payload.to} from="${config.senderName} <${config.senderEmail}>" subject="${payload.subject}" via Brevo...`);

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: config.senderName, email: config.senderEmail },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const senderDomain = config.senderEmail.split("@")[1] ?? "?";
      console.error(
        `[email-provider] Brevo API rejected ${res.status} for to=${payload.to} from=${config.senderEmail}. Body: ${body.slice(0, 400)}`,
      );
      // Surface the most common diagnostic up front. Brevo returns a
      // structured `{ "code": "unauthorized", "message": "..." }` body
      // for these errors — surface them visibly so admins don't have to
      // trawl logs.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        console.error(
          `[email-provider] Hint: verify the sender ${senderDomain ? `domain "${senderDomain}"` : `email "${config.senderEmail}"`} in the Brevo dashboard (Senders & IP). Unverified senders are the most common cause of 400/401/403 from /v3/smtp/email.`,
        );
      }
      return false;
    }

    console.info(`[email-provider] Brevo accepted email to=${payload.to} from=${config.senderEmail} (${res.status}).`);
    return true;
  } catch (e) {
    console.error(
      `[email-provider] Network/fetch error sending to ${payload.to}:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}
