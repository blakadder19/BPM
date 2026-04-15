/**
 * Shared BPM email design system.
 *
 * All Special Events email templates (purchase confirmation, payment
 * confirmation, reminder) import from here so branding stays consistent.
 *
 * Every helper returns raw HTML strings safe for inline email rendering.
 * No CSS classes or external stylesheets — everything is inline.
 *
 * LOGO STRATEGY — The header uses the real BPM logo JPG served from the
 * production domain. The URL is never derived from NEXT_PUBLIC_APP_URL
 * (which is localhost in dev). Instead it uses BPM_EMAIL_LOGO_URL env
 * var, or falls back to the production domain automatically.  When email
 * clients block remote images the alt text "BPM" shows on a white
 * background alongside the coral accent strip, so branding is never lost.
 */

// ── BPM Brand Palette ─────────────────────────────────────────
export const B = {
  BPM_500: "#d4542c",
  BPM_600: "#be4825",
  BPM_700: "#a03d20",
  BPM_50: "#fef7f4",
  DARK: "#18181b",
  DARK_MID: "#27272a",
  DARK_SOFT: "#333338",
  WHITE: "#ffffff",
  ZINC_50: "#fafafa",
  ZINC_100: "#f4f4f5",
  ZINC_200: "#e4e4e7",
  ZINC_300: "#d4d4d8",
  ZINC_400: "#a1a1aa",
  ZINC_500: "#71717a",
  ZINC_700: "#3f3f46",
  GREEN: "#166534",
  GREEN_BG: "#f0fdf4",
  AMBER: "#854d0e",
  AMBER_BG: "#fefce8",
  SKY: "#0c4a6e",
  SKY_BG: "#f0f9ff",
  SKY_BORDER: "#0284c7",
};

// ── Layout primitives ─────────────────────────────────────────

export function bpmEmailDocument(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>BPM — Balance Power Motion</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${B.ZINC_100};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.ZINC_100};padding:24px 12px 40px;">
<tr><td align="center">
${innerHtml}
</td></tr>
</table>
</body>
</html>`;
}

function cardOpen(): string {
  return `<table role="presentation" width="100%" style="max-width:580px;background:${B.WHITE};border-radius:12px;overflow:hidden;border-collapse:collapse;" cellpadding="0" cellspacing="0">`;
}
function cardClose(): string {
  return `</table>`;
}

// ── Logo URL ──────────────────────────────────────────────────
// Email images must use a publicly reachable absolute URL.  Never use
// localhost/127.0.0.1 — Gmail, Outlook, etc. can't fetch those.

const PRODUCTION_DOMAIN = "https://book.balancepowermotion.com";

function bpmLogoUrl(): string {
  if (process.env.BPM_EMAIL_LOGO_URL) return process.env.BPM_EMAIL_LOGO_URL;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_DOMAIN;

  if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
    return `${PRODUCTION_DOMAIN}/branding/bpm-logo-full.jpg`;
  }
  return `${appUrl}/branding/bpm-logo-full.jpg`;
}

// ── Header ────────────────────────────────────────────────────
// Real logo image on white background with a coral accent strip below.
// When images are blocked the alt text "BPM — Balance Power Motion"
// renders on the white cell, keeping the brand visible.

export function bpmEmailHeader(): string {
  const logoSrc = bpmLogoUrl();
  return `
${cardOpen()}
  <tr><td align="center" style="padding:28px 32px 20px;background:${B.WHITE};">
    <img src="${logoSrc}" alt="BPM — Balance Power Motion" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
  </td></tr>
  <tr><td style="height:4px;background:${B.BPM_500};font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

// ── Cover image (poster card) ─────────────────────────────────
// Rendered as a centered poster card — width-controlled, natural height.
// No max-height or object-fit:cover, so portrait/Instagram artwork is
// never cropped.  A subtle border + rounded corners frame it cleanly.

export function bpmCoverImage(imageUrl: string, eventTitle: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid ${B.ZINC_200};">
        <tr><td style="line-height:0;font-size:0;">
          <img src="${imageUrl}" alt="${eventTitle}" width="360" style="display:block;width:100%;max-width:360px;height:auto;border:0;" />
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// ── Body open/close ───────────────────────────────────────────

export function bpmBodyOpen(recipientName: string, heading: string): string {
  return `
  <tr><td style="padding:36px 32px 0;">
    <p style="margin:0 0 8px;color:${B.ZINC_500};font-size:14px;line-height:1.5;">Hi ${recipientName},</p>
    <h1 style="margin:0 0 16px;color:${B.DARK};font-size:22px;font-weight:700;line-height:1.3;">${heading}</h1>
    <table role="presentation" width="60" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="height:3px;background:${B.BPM_500};font-size:0;line-height:0;border-radius:2px;">&nbsp;</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px;">`;
}

export function bpmBodyClose(): string {
  return `
  </td></tr>
  <tr><td style="height:40px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

// ── Footer ────────────────────────────────────────────────────

export function bpmEmailFooter(appUrl: string): string {
  return `
  <tr><td style="height:3px;background:${B.BPM_500};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="background:${B.DARK};padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:14px;">
        <span style="color:${B.WHITE};font-size:16px;font-weight:800;letter-spacing:2px;">BPM</span>
        <span style="color:${B.ZINC_400};font-size:11px;font-weight:500;margin-left:8px;letter-spacing:1px;">balance &middot; power &middot; motion</span>
      </td></tr>
      <tr><td align="center" style="border-top:1px solid ${B.DARK_SOFT};padding-top:14px;">
        <p style="margin:0 0 6px;color:${B.ZINC_400};font-size:12px;line-height:1.5;">
          Dublin's social dance academy
        </p>
        <p style="margin:0;color:${B.ZINC_500};font-size:11px;line-height:1.5;">
          This is an automated message from <a href="${appUrl}" style="color:${B.ZINC_400};text-decoration:underline;">BPM</a>. Please do not reply directly.
        </p>
      </td></tr>
    </table>
  </td></tr>
${cardClose()}`;
}

// ── Full email wrapper ────────────────────────────────────────

export interface BpmEmailOpts {
  appUrl: string;
  recipientName: string;
  heading: string;
  bodyHtml: string;
  coverImageUrl?: string;
  eventTitle?: string;
}

export function bpmEmailWrap(opts: BpmEmailOpts): string {
  const coverHtml = opts.coverImageUrl && opts.eventTitle
    ? bpmCoverImage(opts.coverImageUrl, opts.eventTitle)
    : "";

  const inner = [
    bpmEmailHeader(),
    bpmBodyOpen(opts.recipientName, opts.heading),
    coverHtml,
    opts.bodyHtml,
    bpmBodyClose(),
    bpmEmailFooter(opts.appUrl),
  ].join("\n");
  return bpmEmailDocument(inner);
}

// ── Components ────────────────────────────────────────────────

export function bpmStatusBadge(status: "paid" | "pending"): string {
  if (status === "paid") {
    return `<span style="display:inline-block;padding:5px 14px;background:${B.GREEN_BG};color:${B.GREEN};border-radius:20px;font-size:13px;font-weight:600;line-height:1.4;">&#10003; Paid</span>`;
  }
  return `<span style="display:inline-block;padding:5px 14px;background:${B.AMBER_BG};color:${B.AMBER};border-radius:20px;font-size:13px;font-weight:600;line-height:1.4;">Pending &mdash; pay at reception</span>`;
}

export function bpmDetailRow(label: string, valueHtml: string, isLast = false): string {
  const border = isLast ? "" : `border-bottom:1px solid ${B.ZINC_100};`;
  return `<tr>
    <td style="padding:12px 16px;color:${B.ZINC_500};font-size:12px;font-weight:600;width:100px;vertical-align:top;${border}text-transform:uppercase;letter-spacing:0.3px;">${label}</td>
    <td style="padding:12px 16px;color:${B.DARK};font-size:14px;font-weight:500;${border}">${valueHtml}</td>
  </tr>`;
}

export function bpmDetailsCard(rows: { label: string; valueHtml: string }[], title = "Purchase details"): string {
  const rowsHtml = rows.map((r, i) => bpmDetailRow(r.label, r.valueHtml, i === rows.length - 1)).join("");
  return `
    <table role="presentation" style="width:100%;margin:0 0 28px;border:1px solid ${B.ZINC_200};border-radius:10px;overflow:hidden;border-collapse:separate;border-spacing:0;" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="padding:11px 16px;background:${B.BPM_50};border-bottom:2px solid ${B.BPM_500};">
        <span style="font-size:11px;font-weight:700;color:${B.BPM_700};text-transform:uppercase;letter-spacing:0.8px;">${title}</span>
      </td></tr>
      ${rowsHtml}
    </table>`;
}

export function bpmNotice(type: "info" | "warning" | "coral", html: string): string {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    info: { bg: B.SKY_BG, border: B.SKY_BORDER, color: B.SKY },
    warning: { bg: B.AMBER_BG, border: B.AMBER, color: B.AMBER },
    coral: { bg: B.BPM_50, border: B.BPM_500, color: B.ZINC_700 },
  };
  const s = styles[type];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="padding:16px 20px;background:${s.bg};border-radius:8px;border-left:4px solid ${s.border};">
      <p style="margin:0;color:${s.color};font-size:13px;line-height:1.6;">${html}</p>
    </td></tr>
  </table>`;
}

export function bpmCtaButton(url: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 8px;">
    <tr><td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" fillcolor="${B.BPM_500}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:'Segoe UI',sans-serif;font-size:15px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}" style="display:inline-block;padding:14px 36px;background:${B.BPM_500};color:${B.WHITE};text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;mso-hide:all;">${label}</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;
}

export function bpmQrBlock(token: string): string {
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=200x200&margin=8`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td style="background:${B.DARK};border-radius:12px;padding:24px 20px;text-align:center;">
      <p style="margin:0 0 6px;color:${B.WHITE};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Event check-in</p>
      <p style="margin:0 0 20px;color:${B.ZINC_400};font-size:13px;">Show this QR code at reception when you arrive.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td style="background:${B.WHITE};border-radius:10px;padding:16px;">
          <img src="${qrImageUrl}" alt="QR Code" width="176" height="176" style="display:block;border:0;border-radius:4px;" />
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:${B.ZINC_500};font-size:11px;">Ref: <code style="background:${B.DARK_SOFT};color:${B.ZINC_300};padding:2px 8px;border-radius:4px;font-size:11px;">${token}</code></p>
    </td></tr>
  </table>`;
}
