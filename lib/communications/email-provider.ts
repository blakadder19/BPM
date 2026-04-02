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

  const fromRaw = process.env.EMAIL_FROM_ADDRESS ?? "BPM <noreply@bpm.dance>";
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
    console.info("[email] Skipped — BREVO_API_KEY not configured.");
    return false;
  }

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
      console.warn(
        `[email] Brevo API ${res.status}: ${body.slice(0, 200)}`,
      );
      return false;
    }

    return true;
  } catch (e) {
    console.warn(
      "[email] Send failed:",
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}
