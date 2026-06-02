import type { EmailBlocks } from "./layout";
import { appBaseUrl } from "./layout";

const SUPPORT_EMAIL = "concierge@purpleclub.org";

export function renderEmailPlain(blocks: EmailBlocks): string {
  const lines: string[] = [];
  lines.push("Purple Club");
  lines.push("==========");
  lines.push("");
  lines.push(blocks.headline);
  lines.push("");

  for (const paragraph of blocks.paragraphs) {
    if (!paragraph || paragraph.trim().length === 0) continue;
    lines.push(stripHtml(paragraph));
    lines.push("");
  }

  if (blocks.ctaLabel && blocks.ctaHref) {
    lines.push(`${blocks.ctaLabel}:`);
    lines.push(blocks.ctaHref);
    lines.push("");
  }

  if (blocks.footerNote) {
    lines.push(stripHtml(blocks.footerNote));
    lines.push("");
  }

  lines.push("--");
  lines.push(
    blocks.audience === "member"
      ? "You received this email because you submitted a request on Purple Club."
      : "You received this email as the Purple Club concierge.",
  );
  lines.push(`Support: ${SUPPORT_EMAIL}`);
  // Only members see the unsubscribe line; agent emails are operational and
  // including it makes Outlook EOP score the message as bulk/marketing.
  if (blocks.audience === "member") {
    lines.push(`Unsubscribe: ${appBaseUrl()}/unsubscribe`);
  }

  return lines.join("\n");
}

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
