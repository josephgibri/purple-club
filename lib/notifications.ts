import { Resend } from "resend";
import {
  appUrl,
  escapeHtml,
  renderEmailLayout,
  type EmailBlocks,
} from "./email/layout";
import { renderEmailPlain } from "./email/plain";

export type NotificationEvent =
  | "request_received"
  | "offer_ready"
  | "offer_expired"
  | "change_request_opened"
  | "change_request_resolved"
  | "renegotiation_requested"
  | "payment_submitted"
  | "payment_rejected"
  | "payment_verified"
  | "confirmed"
  | "cancel_pre_payment"
  | "cancellation_refund_requested"
  | "refund_processed"
  | "gift_unlocked"
  | "gift_claimed"
  | "gift_fulfilled";

export type NotificationAudience = "member" | "agent";

export type NotificationContext = {
  requestCode: string;
  hotelName?: string | null;
  offerMode?: "REQUESTED_HOTEL" | "ALTERNATIVES" | "BOTH" | null;
  changeRequestType?: string | null;
  changeRequestNote?: string | null;
  agentChangeReply?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentNote?: string | null;
  paymentTxSignature?: string | null;
  paymentVerifiedAmountLamports?: string | null;
  cancelReason?: string | null;
  // Who initiated the cancellation. Drives copy on the member-facing
  // "Cancellation received" / "Refund being processed" template — if the
  // agent cancelled, we don't say "we received your cancellation" because
  // it'd read as if the member had asked.
  cancelActor?: "MEMBER" | "AGENT" | null;
  refundAmountUsd?: string | null;
  refundFeePercent?: number | null;
  refundPolicySummary?: string | null;
  refundTxSignature?: string | null;
  giftCode?: string | null;
  giftClaimUrl?: string | null;
  giftRecipientWallet?: string | null;
  giftRecipientEmail?: string | null;
  giftTxSignature?: string | null;
  roundNumber?: number | null;
  offerExpiresAt?: string | null;
  paymentRejectReason?: string | null;
};

type DispatchParams = {
  event: NotificationEvent;
  member?: { email?: string | null } | null;
  context: NotificationContext;
};

const FROM_DEFAULT_NAME = "Purple Club Concierge";
const LIST_UNSUBSCRIBE_MAILTO = "mailto:unsubscribe@purplestay.co";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) return null;
  const fromName = process.env.RESEND_FROM_NAME?.trim() || FROM_DEFAULT_NAME;
  const from = fromEmail.includes("<")
    ? fromEmail
    : `${fromName} <${fromEmail}>`;
  // Replies should land on a real inbox, not bounce off no-reply. We
  // default to concierge@purplestay.co (matches the email footer link)
  // and let the env override for staging/test domains.
  const replyTo =
    process.env.RESEND_REPLY_TO?.trim() || "concierge@purplestay.co";
  return { client: new Resend(apiKey), from, replyTo };
}

/**
 * Parses AGENT_NOTIFICATIONS_EMAIL into a deduped list of recipient
 * addresses. Accepts comma- or whitespace-separated values so a single env
 * var can fan out to multiple agents (Resend's `to` field supports up to 50
 * recipients per send, well above any realistic agent count).
 */
function getAgentInbox(): string[] {
  const raw = process.env.AGENT_NOTIFICATIONS_EMAIL ?? "";
  const seen = new Set<string>();
  const inboxes: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) continue;
    seen.add(lower);
    inboxes.push(trimmed);
  }
  return inboxes;
}

function safeHotelHtml(hotelName?: string | null) {
  return hotelName && hotelName.length > 0
    ? escapeHtml(hotelName)
    : "your selected property";
}

function alternativesAutoMessage(hotelName?: string | null) {
  const requested = safeHotelHtml(hotelName);
  return `Your requested property <strong>${requested}</strong> is currently unavailable in the price band we target, so the concierge curated a few similar properties in matching style and location for your review. If you would prefer another round of negotiation specifically for <strong>${requested}</strong>, request a re-negotiation from your bookings.`;
}

function bothModeMessage(hotelName?: string | null) {
  const requested = safeHotelHtml(hotelName);
  return `The concierge has prepared a quote for <strong>${requested}</strong> and also lined up a couple of similar properties for the same dates. Open your bookings to compare both and reply with the room you would like to confirm.`;
}

function buildMemberTemplate(
  event: NotificationEvent,
  ctx: NotificationContext,
): EmailBlocks | null {
  const code = escapeHtml(ctx.requestCode);
  const hotelHtml = safeHotelHtml(ctx.hotelName);
  const dashboardUrl = appUrl("/stay");
  const travelUrl = appUrl("/stay");

  switch (event) {
    case "offer_ready": {
      const modeParagraph =
        ctx.offerMode === "ALTERNATIVES"
          ? alternativesAutoMessage(ctx.hotelName)
          : ctx.offerMode === "BOTH"
            ? bothModeMessage(ctx.hotelName)
            : "";
      return {
        subject: `Your concierge replied - ${ctx.requestCode}`,
        preheader: "Your concierge has prepared a quote for your stay request.",
        headline: "Your concierge replied",
        paragraphs: [
          `The concierge has prepared a quote for request <strong>${code}</strong>.`,
          modeParagraph,
          "Open your bookings to review the quote and reply with your decision. The supplier may only hold the quoted price for a limited window.",
          // Closed-user-group reminder: every rate communication carries the
          // confidentiality cue. Soft tone, but it documents that members
          // were told the rates are private — important for the parity-
          // clause defence if it's ever questioned.
          "<em>Member rates are confidential and shared only with the requesting member. Please keep them inside the club.</em>",
        ],
        ctaLabel: "Open Bookings",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    }
    case "offer_expired":
      return {
        subject: `Refresh your offer - ${ctx.requestCode}`,
        preheader:
          "Wholesale rates shift fast. Tap Re-negotiate to ask the concierge for a fresh round.",
        headline: "Your offer has expired",
        paragraphs: [
          `The wholesale offer on <strong>${code}</strong> has expired. Wholesale rates are highly volatile and inventory may have shifted since the original quote.`,
          "Open your Travel Vault and tap <strong>RE-NEGOTIATE RATE</strong> to ask the concierge for a fresh round of pricing. We typically come back within 24 hours.",
        ],
        ctaLabel: "Re-negotiate Rate",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    case "confirmed":
      return {
        subject: `Your booking is confirmed - voucher inside (${ctx.requestCode})`,
        preheader: "Your voucher PDF is ready to download from the Travel Vault.",
        headline: "Booking confirmed",
        paragraphs: [
          `Your stay at <strong>${hotelHtml}</strong> (request <strong>${code}</strong>) is fully confirmed.`,
          "Your voucher PDF is now available to download from your Travel Vault. Bring it with you at check-in or save it on your phone.",
        ],
        ctaLabel: "Open Booking & Voucher",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    case "cancel_pre_payment": {
      // Pre-payment cancel can be initiated by either side. Wording must
      // mirror who actually pressed cancel so the member doesn't read
      // "your request was cancelled" as "we ghosted you" when they did
      // it themselves, or as "you cancelled" when the concierge had to.
      const byAgent = ctx.cancelActor === "AGENT";
      return {
        subject: byAgent
          ? `Concierge cancelled your request - ${ctx.requestCode}`
          : `Your request was cancelled - ${ctx.requestCode}`,
        preheader: byAgent
          ? "Concierge closed this request. No payment was taken."
          : "No payment was taken. Start a new request whenever you are ready.",
        headline: byAgent ? "Concierge cancelled this request" : "Request cancelled",
        paragraphs: byAgent
          ? [
              `Our concierge closed request <strong>${code}</strong>. No payment was taken.`,
              ctx.cancelReason
                ? `<strong>Reason:</strong> ${escapeHtml(ctx.cancelReason)}`
                : "If you'd like to try again with different dates or properties, start a new request anytime — we'll pick it up immediately.",
              "Reply to this email if you have questions about why this request was closed.",
            ]
          : [
              `Your request <strong>${code}</strong> has been cancelled. No payment was taken.`,
              "Whenever you are ready, start a new request and our concierge will begin negotiating again.",
            ],
        ctaLabel: "Start a New Request",
        ctaHref: travelUrl,
        audience: "member",
      };
    }
    case "cancellation_refund_requested": {
      // Refund-stage cancel: same nuance as pre-payment but higher
      // stakes because money is in escrow. The default flow assumes the
      // member asked to cancel (most common); the AGENT branch is fired
      // when the concierge has to cancel a booking the member paid for
      // — usually because the supplier dropped or a no-show penalty
      // triggered. Misattributing this to the member would feel sloppy.
      const byAgent = ctx.cancelActor === "AGENT";
      return {
        subject: byAgent
          ? `Concierge cancelled your booking - refund processing - ${ctx.requestCode}`
          : `Refund being processed - ${ctx.requestCode}`,
        preheader: byAgent
          ? "Concierge cancelled this booking. Refund being processed within 48 hours."
          : "We have received your cancellation. Final position within 48 hours.",
        headline: byAgent
          ? "Concierge cancelled your booking"
          : "Cancellation received",
        paragraphs: byAgent
          ? [
              `Our concierge had to cancel your booking for <strong>${code}</strong>.`,
              ctx.cancelReason
                ? `<strong>Reason:</strong> ${escapeHtml(ctx.cancelReason)}`
                : "The concierge will reach out with full context shortly.",
              `<strong>Refund preview:</strong> ${
                ctx.refundAmountUsd
                  ? `$${escapeHtml(ctx.refundAmountUsd)} USD`
                  : "calculated from supplier policy"
              }${
                typeof ctx.refundFeePercent === "number"
                  ? ` &middot; cancellation fee ${ctx.refundFeePercent}%`
                  : ""
              }.`,
              "The refund is being processed and will reach you (or a final position) within <strong>48 hours</strong>.",
            ]
          : [
              `We received your cancellation for <strong>${code}</strong>.`,
              `<strong>Refund preview:</strong> ${
                ctx.refundAmountUsd
                  ? `$${escapeHtml(ctx.refundAmountUsd)} USD`
                  : "calculated from supplier policy"
              } &middot; cancellation fee ${ctx.refundFeePercent ?? 0}%.`,
              "The concierge is now coordinating with the supplier. You can expect the refund (or a final position) within <strong>48 hours</strong>.",
            ],
        ctaLabel: "View Cancellation",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    }
    case "refund_processed": {
      // USDC refunds always have an on-chain signature; Stripe refunds use
      // the same field for the Stripe refund ID. Only USDC gets a Solscan
      // link — Stripe IDs aren't externally browsable.
      const isUsdc = ctx.paymentMethod === "USDC";
      const txParas: string[] = [];
      if (ctx.refundTxSignature) {
        if (isUsdc) {
          const tx = escapeHtml(ctx.refundTxSignature);
          txParas.push(
            `<strong>Refund transaction:</strong> <a href="https://solscan.io/tx/${tx}" style="color:inherit;">${tx}</a>`,
          );
        } else {
          txParas.push(
            `<strong>Stripe refund ID:</strong> ${escapeHtml(ctx.refundTxSignature)}`,
          );
        }
      }
      return {
        subject: `Refund processed - ${ctx.requestCode}`,
        preheader:
          "Your refund has been sent. Expect it in your wallet shortly.",
        headline: "Refund sent",
        paragraphs: [
          `Your refund for <strong>${code}</strong> has been processed.`,
          `<strong>Amount:</strong> ${
            ctx.refundAmountUsd
              ? `$${escapeHtml(ctx.refundAmountUsd)} USD`
              : "as per your cancellation"
          }${
            isUsdc
              ? " — sent to the wallet you paid from."
              : " — issued back to your original payment method."
          }`,
          ...txParas,
          isUsdc
            ? "USDC settles on Solana within seconds. If you do not see it after 5 minutes, reply to this email with the transaction signature above."
            : "Stripe refunds typically appear in your account within 5-10 business days, depending on your bank.",
        ],
        ctaLabel: "View Booking",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    }
    case "payment_rejected": {
      // Two-path email: if the original offer window already lapsed by
      // the time the agent got around to rejecting, we can't honestly
      // tell the member their offer is "still live" — the server has
      // also bumped them to OFFER_EXPIRED so the dashboard would
      // otherwise contradict the email. Branch the entire copy on that
      // and route them to the "Re-negotiate rate" CTA on the expired
      // card instead.
      const expiryDate = ctx.offerExpiresAt ? new Date(ctx.offerExpiresAt) : null;
      const offerLapsed =
        expiryDate !== null &&
        !Number.isNaN(expiryDate.getTime()) &&
        expiryDate.getTime() <= Date.now();
      const expHtml = expiryDate
        ? escapeHtml(
            expiryDate.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          )
        : null;

      const paras: string[] = [
        `We could not match a payment to your booking for <strong>${code}</strong> (${hotelHtml}).`,
      ];
      if (ctx.paymentRejectReason) {
        paras.push(
          `<strong>Note from concierge:</strong> ${escapeHtml(ctx.paymentRejectReason)}`,
        );
      }

      if (offerLapsed) {
        paras.push(
          expHtml
            ? `Unfortunately, your offer window ended on <strong>${expHtml}</strong> while we were verifying payment, so we can't keep the original quote live.`
            : "Unfortunately, your offer window ended while we were verifying payment, so we can't keep the original quote live.",
        );
        paras.push(
          "Tap below and open the booking in your Travel Vault — you'll see a <strong>Re-negotiate rate</strong> button that asks your concierge to source a fresh wholesale quote for the same dates. If you already sent payment, reply to this email with the proof and we'll work the refund / re-apply alongside the new quote.",
        );
        return {
          subject: `Offer lapsed during verification - ${ctx.requestCode}`,
          preheader:
            "We couldn't match your payment in time. Request a fresh quote in Bookings.",
          headline: "Offer lapsed during verification",
          paragraphs: paras,
          ctaLabel: "Open Bookings",
          ctaHref: dashboardUrl,
          audience: "member",
        };
      }

      paras.push(
        expHtml
          ? `Your private offer is still <strong>live until ${expHtml}</strong> — retry payment in your Travel Vault, or reply to this email with proof of transfer (receipt, tx ID, or screenshot).`
          : "Your private offer is still available — retry payment in your Travel Vault, or reply to this email with proof of transfer.",
      );
      return {
        subject: `We could not verify your payment - ${ctx.requestCode}`,
        preheader:
          "Your offer is still open. Retry payment in Bookings or reply with proof of transfer.",
        headline: "Payment not verified",
        paragraphs: paras,
        ctaLabel: "Open Bookings",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    }
    case "change_request_resolved":
      return {
        subject: `Concierge replied to your change request - ${ctx.requestCode}`,
        preheader: "Your booking has been updated in the Travel Vault.",
        headline: "Concierge update",
        paragraphs: [
          `Your change request for <strong>${code}</strong> has been reviewed.`,
          `<strong>Concierge reply:</strong> ${escapeHtml(
            ctx.agentChangeReply ?? "Your request has been updated in the Travel Vault.",
          )}`,
        ],
        ctaLabel: "Open Bookings",
        ctaHref: dashboardUrl,
        audience: "member",
      };
    case "gift_claimed":
      // gift_claimed is no longer dispatched to members — gift_fulfilled
      // covers the success notification once the transfer lands. Kept here
      // so the type union still resolves; returning null skips the send.
      return null;
    case "gift_fulfilled":
      return {
        subject: "Your Purple Club gift has been delivered",
        preheader: "1 PBTC has landed in your friend's wallet.",
        headline: "Gift delivered",
        paragraphs: [
          "Your friend has claimed the 1 PBTC gift you shared, and Purple Club has delivered it on Solana.",
          ctx.giftTxSignature
            ? `<strong>Tx:</strong> <code style="font-family:monospace;font-size:13px;">${escapeHtml(ctx.giftTxSignature)}</code>`
            : "",
          "Thank you for sharing the Purple secret.",
        ],
        audience: "member",
      };
    case "request_received":
    case "payment_verified":
    case "renegotiation_requested":
    case "payment_submitted":
    case "gift_unlocked":
      return null;
    default:
      return null;
  }
}

function buildAgentTemplate(
  event: NotificationEvent,
  ctx: NotificationContext,
): EmailBlocks | null {
  const code = escapeHtml(ctx.requestCode);
  const hotelHtml = safeHotelHtml(ctx.hotelName);
  const adminUrl = appUrl("/admin/travel");

  switch (event) {
    case "request_received":
      return {
        subject: `New Purple Club request - ${ctx.requestCode}`,
        preheader: "A member just opened a new travel request.",
        headline: "New travel request",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          "Open the Concierge Desk to start the negotiation.",
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    case "payment_submitted":
      // USDC settles automatically via the on-chain matcher (webhook + the
      // one-shot verifier) — no human in the loop is needed for the
      // verification step. Skip the noisy "submitted, please verify" email
      // so agents only hear about USDC bookings when they're actually
      // verified and ready for voucher upload.
      if ((ctx.paymentMethod ?? "").toUpperCase() === "USDC") {
        return null;
      }
      return {
        subject: `Payment submitted - ${ctx.requestCode}`,
        preheader: "Member submitted payment. Verify and confirm the booking.",
        headline: "Member submitted payment",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          `<ul style="margin:0;padding:0 0 0 18px;">
            <li><strong>Method:</strong> ${escapeHtml(ctx.paymentMethod ?? "-")}</li>
            <li><strong>Reference:</strong> ${escapeHtml(ctx.paymentReference ?? "-")}</li>
            <li><strong>Note:</strong> ${escapeHtml(ctx.paymentNote ?? "-")}</li>
          </ul>`,
          "Verify the payment in the Concierge Desk, then mark the booking as confirmed once the voucher is uploaded.",
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    case "change_request_opened":
      return {
        subject: `Change request - ${ctx.requestCode}`,
        preheader: "Member requested a booking change.",
        headline: "Member requested a booking change",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          `<ul style="margin:0;padding:0 0 0 18px;">
            <li><strong>Type:</strong> ${escapeHtml(ctx.changeRequestType ?? "-")}</li>
            <li><strong>Note:</strong> ${escapeHtml(ctx.changeRequestNote ?? "-")}</li>
          </ul>`,
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    case "renegotiation_requested":
      return {
        subject: `Re-negotiation requested - ${ctx.requestCode}${
          ctx.roundNumber ? ` - Round ${ctx.roundNumber}` : ""
        }`,
        preheader: "Previous offer expired. Member asked for a fresh round.",
        headline: "Member asked for a fresh round",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          "The previous offer expired and the member tapped <strong>RE-NEGOTIATE RATE</strong>. The prior round has been snapshotted - open the request to draft a refreshed offer.",
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    case "cancel_pre_payment":
      return {
        subject: `Cancelled (pre-payment) - ${ctx.requestCode}`,
        preheader: "Member cancelled before payment. No refund needed.",
        headline: "Member cancelled before payment",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          `<strong>Reason:</strong> ${escapeHtml(ctx.cancelReason ?? "-")}`,
          "No refund action required. Negotiation is closed.",
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    case "cancellation_refund_requested": {
      // If the agent themselves clicked Cancel on the desk, we'd be
      // emailing them their own action. The route is the right place
      // to suppress that — here we just keep the copy accurate by
      // labelling the reason field correctly when it does fire.
      const byAgent = ctx.cancelActor === "AGENT";
      return {
        subject: `Refund required - ${ctx.requestCode}${
          ctx.refundAmountUsd ? ` ($${ctx.refundAmountUsd})` : ""
        }`,
        preheader: "Cancellation after payment. Process refund within 48h SLA.",
        headline: "Cancellation after payment - refund queue",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          `<ul style="margin:0;padding:0 0 0 18px;">
            <li><strong>Refund amount:</strong> ${
              ctx.refundAmountUsd
                ? `$${escapeHtml(ctx.refundAmountUsd)} USD`
                : "compute manually"
            }</li>
            <li><strong>Cancellation fee:</strong> ${ctx.refundFeePercent ?? 0}%</li>
            <li><strong>Policy:</strong> ${escapeHtml(ctx.refundPolicySummary ?? "see request")}</li>
            <li><strong>${byAgent ? "Agent reason" : "Member reason"}:</strong> ${escapeHtml(ctx.cancelReason ?? "-")}</li>
          </ul>`,
          "Coordinate with the supplier and process the refund within the 48h SLA.",
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    }
    case "gift_claimed":
      return {
        subject: `Gift claimed - auto-delivering ${ctx.giftCode ?? ""}`.trim(),
        preheader: "1 PBTC is auto-delivering from the treasury. Monitor only.",
        headline: "Gift claimed - auto-delivering",
        paragraphs: [
          `<ul style="margin:0;padding:0 0 0 18px;">
            <li><strong>Gift code:</strong> ${escapeHtml(ctx.giftCode ?? "-")}</li>
            <li><strong>Recipient wallet:</strong> ${escapeHtml(ctx.giftRecipientWallet ?? "-")}</li>
            <li><strong>Recipient email:</strong> ${escapeHtml(ctx.giftRecipientEmail ?? "-")}</li>
          </ul>`,
          "1 PBTC is being auto-delivered from the treasury wallet. Open the gift queue only if delivery fails.",
        ],
        ctaLabel: "Open Gift Queue",
        ctaHref: `${adminUrl}/gifts`,
        audience: "agent",
      };
    case "payment_verified": {
      const isUsdc = (ctx.paymentMethod ?? "").toUpperCase() === "USDC";
      return {
        subject: `Payment verified - ${ctx.requestCode}${
          isUsdc ? " (USDC, auto)" : ""
        }`,
        preheader: isUsdc
          ? "USDC auto-verified on-chain. Upload the voucher to confirm."
          : "Payment marked verified. Upload the voucher to confirm.",
        headline: isUsdc
          ? "USDC payment auto-verified — upload voucher"
          : "Payment verified — upload voucher",
        paragraphs: [
          `<strong>${code}</strong> &middot; ${hotelHtml}`,
          isUsdc
            ? `Matched on-chain via Helius / on-demand verifier. Tx: <span style="font-family:ui-monospace,monospace;">${escapeHtml(
                ctx.paymentTxSignature ?? "-",
              )}</span>.`
            : "The booking is locked and ready for voucher upload.",
          "Upload the voucher PDF in the Concierge Desk and tap Mark Confirmed to release it to the member.",
        ],
        ctaLabel: "Open Concierge Desk",
        ctaHref: adminUrl,
        audience: "agent",
      };
    }
    case "gift_unlocked":
    case "offer_ready":
    case "offer_expired":
    case "payment_rejected":
    case "confirmed":
    case "gift_fulfilled":
    case "change_request_resolved":
      return null;
    default:
      return null;
  }
}

type SendOutcome = { ok: true; id: string | null } | { ok: false; reason: string };

const SEND_MAX_ATTEMPTS = 3;
const SEND_RETRY_DELAY_MS = 400;

function isTransientErrorMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("aborted") ||
    lower.includes("econn") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("eai_again") ||
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes("ratelimit") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504")
  );
}

async function sendEmail(
  client: Resend,
  from: string,
  to: string | string[],
  blocks: EmailBlocks,
  label: string,
  options: { replyTo?: string } = {},
): Promise<SendOutcome> {
  const html = renderEmailLayout(blocks);
  const text = renderEmailPlain(blocks);
  const recipients = Array.isArray(to) ? to : [to];
  const recipientLabel = recipients.join(", ");
  // Member newsletters / receipts include RFC 8058 one-click unsubscribe so
  // big mailbox providers (Gmail, Yahoo) accept us at scale. Agent inboxes
  // are a tiny operational set — those same headers signal "bulk mail" to
  // Microsoft EOP and push the message into Junk even though SPF/DKIM/DMARC
  // pass. Audience-gating the headers keeps member compliance intact while
  // letting agent mail land as plain transactional notices.
  const payload = {
    from,
    to: recipients,
    subject: blocks.subject,
    html,
    text,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    ...(blocks.audience === "member"
      ? {
          headers: {
            "List-Unsubscribe": `<${LIST_UNSUBSCRIBE_MAILTO}>, <${appUrl(
              "/unsubscribe",
            )}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  };

  let lastReason = "Unknown email error.";

  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await client.emails.send(payload);
      if (result.error) {
        const message =
          (result.error as { message?: string })?.message ??
          JSON.stringify(result.error);
        lastReason = message;
        console.error(
          `[notifications] ${label} attempt ${attempt}/${SEND_MAX_ATTEMPTS} REJECTED by Resend for ${recipientLabel}:`,
          result.error,
        );
        if (attempt < SEND_MAX_ATTEMPTS && isTransientErrorMessage(message)) {
          await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_DELAY_MS * attempt));
          continue;
        }
        return { ok: false, reason: message };
      }
      const id = result.data?.id ?? null;
      console.info(
        `[notifications] ${label} accepted by Resend for ${recipientLabel} (id=${id ?? "?"}, attempt ${attempt})`,
      );
      return { ok: true, id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastReason = message;
      console.error(
        `[notifications] ${label} attempt ${attempt}/${SEND_MAX_ATTEMPTS} threw for ${recipientLabel}:`,
        error,
      );
      if (attempt < SEND_MAX_ATTEMPTS && isTransientErrorMessage(message)) {
        await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_DELAY_MS * attempt));
        continue;
      }
      return { ok: false, reason: message };
    }
  }

  return { ok: false, reason: lastReason };
}

export type NotificationDispatchResult = {
  memberAttempted: boolean;
  memberOk: boolean | null;
  memberError: string | null;
  agentAttempted: boolean;
  agentOk: boolean | null;
  agentError: string | null;
  configured: boolean;
};

export async function dispatchNotification(
  params: DispatchParams,
): Promise<NotificationDispatchResult> {
  const result: NotificationDispatchResult = {
    memberAttempted: false,
    memberOk: null,
    memberError: null,
    agentAttempted: false,
    agentOk: null,
    agentError: null,
    configured: false,
  };

  try {
    const env = getResendClient();
    if (!env) {
      console.warn(
        `[notifications] ${params.event} skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not set`,
      );
      return result;
    }
    result.configured = true;

    const memberEmail = params.member?.email?.trim() || null;
    const agentInbox = getAgentInbox();

    const memberBlocks = buildMemberTemplate(params.event, params.context);
    const agentBlocks = buildAgentTemplate(params.event, params.context);

    const tasks: Promise<unknown>[] = [];

    if (memberBlocks) {
      result.memberAttempted = true;
      if (!memberEmail) {
        result.memberOk = false;
        result.memberError = "No email on file for member.";
        console.warn(
          `[notifications] member ${params.event} skipped: no email on file for ${params.context.requestCode}`,
        );
      } else {
        tasks.push(
          sendEmail(
            env.client,
            env.from,
            memberEmail,
            memberBlocks,
            `member.${params.event}`,
            { replyTo: env.replyTo },
          ).then((outcome) => {
            if (outcome.ok) {
              result.memberOk = true;
            } else {
              result.memberOk = false;
              result.memberError = outcome.reason;
            }
          }),
        );
      }
    }

    if (agentBlocks) {
      result.agentAttempted = true;
      if (agentInbox.length === 0) {
        result.agentOk = false;
        result.agentError = "AGENT_NOTIFICATIONS_EMAIL is not set.";
        console.warn(
          `[notifications] agent ${params.event} skipped: AGENT_NOTIFICATIONS_EMAIL not set`,
        );
      } else {
        // Send one message per agent rather than a single multi-recipient
        // email. Strict spam filters (Outlook in particular) treat 1:1
        // messages more leniently than visible "to: a, b, c" lists, and
        // this keeps a per-agent failure from poisoning the others.
        const agentOutcomes = await Promise.allSettled(
          agentInbox.map((inbox) =>
            sendEmail(
              env.client,
              env.from,
              inbox,
              agentBlocks,
              `agent.${params.event}`,
              { replyTo: env.replyTo },
            ),
          ),
        );

        let allOk = true;
        const errors: string[] = [];
        for (const outcome of agentOutcomes) {
          if (outcome.status === "fulfilled") {
            if (outcome.value.ok) continue;
            allOk = false;
            errors.push(outcome.value.reason);
          } else {
            allOk = false;
            errors.push(
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
            );
          }
        }
        result.agentOk = allOk;
        if (!allOk) {
          result.agentError = errors.join(" | ");
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  } catch (error) {
    console.error("[notifications] dispatcher error:", error);
  }

  return result;
}

const STATUS_TO_EVENT: Record<string, NotificationEvent> = {
  PENDING: "request_received",
  OFFER_READY: "offer_ready",
  OFFER_EXPIRED: "offer_expired",
  PAYMENT_SUBMITTED: "payment_submitted",
  PAYMENT_VERIFIED: "payment_verified",
  CONFIRMED: "confirmed",
  CANCELLED: "cancel_pre_payment",
};

/** Backwards-compatible helper. Prefer `dispatchNotification`. */
export async function sendStatusEmail(params: {
  to: string;
  requestCode: string;
  status: string;
  hotelName?: string | null;
}) {
  const event = STATUS_TO_EVENT[params.status];
  if (!event) return;
  await dispatchNotification({
    event,
    member: { email: params.to },
    context: {
      requestCode: params.requestCode,
      hotelName: params.hotelName ?? null,
    },
  });
}

/** Returns a short message describing the member email failure, or null when fine. */
export function memberEmailWarning(
  result: NotificationDispatchResult,
): string | null {
  if (!result.memberAttempted) return null;
  if (result.memberOk) return null;
  if (!result.configured) {
    return "Email service is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).";
  }
  if (result.memberError) {
    return `Member email did not send: ${result.memberError}`;
  }
  return "Member email did not send.";
}
