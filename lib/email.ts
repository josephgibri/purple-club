import { Resend } from "resend";

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ported from Purple Club — validates + normalizes a free-form email input. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!BASIC_EMAIL_RE.test(email)) return null;
  return email;
}

let cachedClient: Resend | null = null;

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL ?? "Purple Club <onboarding@resend.dev>"
  );
}

function getSiteOrigin(): string {
  return process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://purpleclub.org";
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Send transactional email if Resend is configured. Never throws — failures
 * are logged so they don't block API responses.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.emails.send({
      from: getFromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

const baseStyles = `
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: #0b0618; color: #f5f3ff; padding: 32px 24px;
`;

function wrapHtml(body: string): string {
  return `
  <div style="${baseStyles}">
    <div style="max-width: 560px; margin: 0 auto; background: #150a30; border: 1px solid #2c1d4a; border-radius: 16px; padding: 28px;">
      <h1 style="font-size: 14px; font-weight: 600; letter-spacing: 0.28em; text-transform: uppercase; color: #d4af37; margin: 0 0 16px;">Purple Club</h1>
      ${body}
    </div>
    <p style="text-align: center; font-size: 12px; color: #a89bd1; margin: 24px 0 0;">A private discount network for the PBTC community.</p>
  </div>`;
}

export type ListingApprovedEmailInput = {
  to: string;
  businessName: string;
  merchantId: string;
};

export async function sendListingApprovedEmail(input: ListingApprovedEmailInput): Promise<void> {
  const origin = getSiteOrigin();
  const dashboardUrl = `${origin}/merchant/dashboard`;
  const directoryUrl = `${origin}/?merchant=${encodeURIComponent(input.merchantId)}`;

  const text = `Great news — ${input.businessName} is now live on Purple Club.

Members can find your listing here: ${directoryUrl}

Manage your listing anytime: ${dashboardUrl}

Thanks for joining the network.
— The Purple Club team`;

  const html = wrapHtml(`
    <h2 style="font-size: 22px; margin: 0 0 12px; color: #ffffff;">Your listing is live ✓</h2>
    <p style="margin: 0 0 16px; color: #ddd6fe;">${input.businessName} is now visible to PBTC holders worldwide.</p>
    <p style="margin: 0 0 24px;">
      <a href="${directoryUrl}" style="display:inline-block; background:#d4af37; color:#0b0618; padding:10px 18px; border-radius:10px; text-decoration:none; font-weight:600;">View in directory</a>
      <a href="${dashboardUrl}" style="display:inline-block; margin-left: 12px; color:#ddd6fe; text-decoration: underline;">Open dashboard</a>
    </p>
    <p style="margin: 0; font-size: 13px; color: #a89bd1;">You can update your listing anytime from the dashboard.</p>
  `);

  await sendEmail({
    to: input.to,
    subject: `Approved: ${input.businessName} is live on Purple Club`,
    text,
    html,
  });
}

export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  ttlMinutes: number;
};

/**
 * Email sent in response to a /forgot request. The link contains a
 * one-time token that lasts `ttlMinutes`; clicking it lands on the
 * /reset page where the user picks a new password.
 *
 * We intentionally don't disclose whether the email matched a real
 * account in the response to /forgot — the email itself is the
 * only confirmation channel. Failing to send (Resend offline) is
 * silently swallowed by `sendEmail`.
 */
export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const text = `Someone asked to reset the password on your Purple Club account.

Reset your password (expires in ${input.ttlMinutes} minutes):
${input.resetUrl}

If this wasn't you, you can ignore this email — your password won't change.

— The Purple Club team`;

  const html = wrapHtml(`
    <h2 style="font-size: 22px; margin: 0 0 12px; color: #ffffff;">Reset your password</h2>
    <p style="margin: 0 0 16px; color: #ddd6fe;">Someone asked to reset the password on your Purple Club account. If that was you, click below within the next ${input.ttlMinutes} minutes.</p>
    <p style="margin: 0 0 24px;">
      <a href="${input.resetUrl}" style="display:inline-block; background:#d4af37; color:#0b0618; padding:10px 18px; border-radius:10px; text-decoration:none; font-weight:600;">Reset password</a>
    </p>
    <p style="margin: 0 0 8px; font-size: 13px; color: #a89bd1;">Or paste this URL into your browser:</p>
    <p style="margin: 0 0 24px; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #8b7ec3;">${input.resetUrl}</p>
    <p style="margin: 0; font-size: 13px; color: #a89bd1;">If this wasn't you, ignore this email — your password won't change.</p>
  `);

  await sendEmail({
    to: input.to,
    subject: "Reset your Purple Club password",
    text,
    html,
  });
}

export type ListingRejectedEmailInput = {
  to: string;
  businessName: string;
  reason: string;
};

export async function sendListingRejectedEmail(input: ListingRejectedEmailInput): Promise<void> {
  const origin = getSiteOrigin();
  const dashboardUrl = `${origin}/merchant/dashboard`;

  const text = `Hi — your Purple Club listing for ${input.businessName} needs a few changes before we can approve it.

Reviewer note:
${input.reason}

Update your listing and resubmit here: ${dashboardUrl}

— The Purple Club team`;

  const html = wrapHtml(`
    <h2 style="font-size: 22px; margin: 0 0 12px; color: #ffffff;">Changes requested</h2>
    <p style="margin: 0 0 16px; color: #ddd6fe;">${input.businessName} needs a few tweaks before it goes live.</p>
    <div style="border: 1px solid #5a3d20; background: #2a1a0a; border-radius: 10px; padding: 14px 16px; margin: 0 0 24px; color: #fde68a;">
      <strong style="display:block; margin-bottom:6px; color:#fcd34d; font-size:12px; text-transform:uppercase; letter-spacing:0.18em;">Reviewer note</strong>
      ${input.reason.replace(/\n/g, "<br/>")}
    </div>
    <p style="margin: 0 0 24px;">
      <a href="${dashboardUrl}" style="display:inline-block; background:#d4af37; color:#0b0618; padding:10px 18px; border-radius:10px; text-decoration:none; font-weight:600;">Update & resubmit</a>
    </p>
    <p style="margin: 0; font-size: 13px; color: #a89bd1;">Once you save the changes from the dashboard, we'll re-review automatically.</p>
  `);

  await sendEmail({
    to: input.to,
    subject: `Action needed: ${input.businessName} listing review`,
    text,
    html,
  });
}
