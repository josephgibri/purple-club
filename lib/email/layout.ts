export type EmailBlocks = {
  subject: string;
  preheader: string;
  headline: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
  audience: "member" | "agent";
};

const BRAND_NAME = "Purple Club";
const BRAND_GOLD = "#EAB308";
const BRAND_PURPLE = "#1A1033";
const BRAND_BG = "#F4F1FA";
const TEXT_PRIMARY = "#1A1033";
const TEXT_MUTED = "#6B7280";
const SUPPORT_EMAIL = "concierge@purplestay.co";

export function appBaseUrl() {
  return (process.env.APP_URL ?? "https://purplestay.co").replace(/\/$/, "");
}

export function appUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${appBaseUrl()}${normalized}`;
}

export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function postalLine() {
  return process.env.BRAND_POSTAL_ADDRESS ?? "Operated by Purple Club Concierge";
}

export function renderEmailLayout(blocks: EmailBlocks): string {
  // Agent emails are operational, not promotional. The fancy gold-button
  // template the member sees can land in Promotions / Spam for our own
  // small set of agent inboxes (cold sender reputation + heavy markup).
  // We render a minimal text-first version for them so it reads as a
  // peer-to-peer transactional notice.
  if (blocks.audience === "agent") {
    return renderAgentEmailLayout(blocks);
  }

  const subject = escapeHtml(blocks.subject);
  const preheader = escapeHtml(blocks.preheader);
  const headline = escapeHtml(blocks.headline);
  const postal = escapeHtml(postalLine());
  const logoUrl = `${appBaseUrl()}/icon-192.png`;
  const unsubscribeUrl = `${appBaseUrl()}/unsubscribe`;

  const paragraphsHtml = blocks.paragraphs
    .filter((p) => p && p.trim().length > 0)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${TEXT_PRIMARY};">${p}</p>`,
    )
    .join("");

  const ctaHtml =
    blocks.ctaLabel && blocks.ctaHref
      ? `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:24px auto 8px auto;">
          <tr>
            <td align="center" bgcolor="${BRAND_GOLD}" style="border-radius:999px;mso-padding-alt:0;">
              <a href="${blocks.ctaHref}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND_PURPLE};text-decoration:none;border-radius:999px;">
                ${escapeHtml(blocks.ctaLabel)}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:${TEXT_MUTED};text-align:center;">
          Or open: <a href="${blocks.ctaHref}" target="_blank" rel="noopener" style="color:${TEXT_MUTED};text-decoration:underline;">${escapeHtml(blocks.ctaHref)}</a>
        </p>
      `
      : "";

  const footerNoteHtml = blocks.footerNote
    ? `<p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:${TEXT_MUTED};font-style:italic;">${blocks.footerNote}</p>`
    : "";

  const disclosure =
    blocks.audience === "member"
      ? `You received this email because you submitted a request on ${BRAND_NAME}.`
      : `You received this email as the ${BRAND_NAME} concierge.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${TEXT_PRIMARY};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND_BG};opacity:0;">${preheader}</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND_BG};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:0 0 18px 0;text-align:center;">
            <img src="${logoUrl}" alt="${BRAND_NAME}" width="44" height="44" style="border-radius:10px;display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;">
            <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:700;color:${BRAND_PURPLE};letter-spacing:0.4px;">${BRAND_NAME}</span>
          </td>
        </tr>
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;padding:32px 28px;box-shadow:0 4px 16px rgba(26,16,51,0.08);">
            <h1 style="margin:0 0 18px 0;font-size:22px;line-height:1.3;color:${BRAND_PURPLE};font-weight:700;">${headline}</h1>
            ${paragraphsHtml}
            ${ctaHtml}
            ${footerNoteHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 12px 0 12px;text-align:center;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:${TEXT_MUTED};">
            <p style="margin:0 0 6px 0;">${disclosure}</p>
            <p style="margin:0 0 6px 0;">
              <a href="mailto:${SUPPORT_EMAIL}" style="color:${TEXT_MUTED};text-decoration:underline;">${SUPPORT_EMAIL}</a>
              &nbsp;&middot;&nbsp;
              <a href="${unsubscribeUrl}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a>
            </p>
            <p style="margin:0;">${postal}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Minimal plain-text-shaped HTML for agent inboxes.
 *
 * No logo image, no rounded card, no gold CTA button — just a title,
 * paragraphs, and a single text link. This style consistently lands
 * in the Inbox for our small agent recipient set rather than getting
 * filtered as marketing.
 */
function renderAgentEmailLayout(blocks: EmailBlocks): string {
  const subject = escapeHtml(blocks.subject);
  const preheader = escapeHtml(blocks.preheader);
  const headline = escapeHtml(blocks.headline);

  const paragraphsHtml = blocks.paragraphs
    .filter((p) => p && p.trim().length > 0)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;color:#111827;">${p}</p>`,
    )
    .join("");

  const ctaHtml =
    blocks.ctaLabel && blocks.ctaHref
      ? `<p style="margin:18px 0 0 0;font-size:14px;line-height:1.55;color:#111827;">${escapeHtml(
          blocks.ctaLabel,
        )}: <a href="${blocks.ctaHref}" target="_blank" rel="noopener" style="color:#1D4ED8;text-decoration:underline;">${escapeHtml(
          blocks.ctaHref,
        )}</a></p>`
      : "";

  const footerNoteHtml = blocks.footerNote
    ? `<p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:${TEXT_MUTED};">${blocks.footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FFFFFF;opacity:0;">${preheader}</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFFFF;">
  <tr>
    <td style="padding:24px 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td>
            <p style="margin:0 0 18px 0;font-size:13px;color:${TEXT_MUTED};">Purple Club concierge desk</p>
            <h1 style="margin:0 0 16px 0;font-size:18px;line-height:1.4;color:#111827;font-weight:600;">${headline}</h1>
            ${paragraphsHtml}
            ${ctaHtml}
            ${footerNoteHtml}
            <p style="margin:24px 0 0 0;font-size:12px;color:${TEXT_MUTED};">— Sent automatically when a member action requires the desk.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
