import "server-only";

/**
 * Lightweight email sender using the Resend HTTP API.
 * Uses plain fetch — no npm dependency required.
 *
 * If RESEND_API_KEY is not set, all sends are silently skipped
 * so the app never crashes due to missing email config.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

function getConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const from = process.env.EMAIL_FROM_ADDRESS ?? "BPM <noreply@bpm.dance>";
  return { apiKey, from };
}

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Send a single email via Resend.
 * Returns true on success, false on failure (never throws).
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    console.info("[email] Skipped — RESEND_API_KEY not configured.");
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[email] Resend API ${res.status}: ${body.slice(0, 200)}`
      );
      return false;
    }

    return true;
  } catch (e) {
    console.warn(
      "[email] Send failed:",
      e instanceof Error ? e.message : e
    );
    return false;
  }
}
