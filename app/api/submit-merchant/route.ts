import { Octokit } from "octokit";
import type { NextRequest } from "next/server";

import { merchants } from "@/data/merchants";
import { buildEditUrl, signEditToken } from "@/lib/editToken";
import {
  submissionPayloadSchema,
  toSlug,
} from "@/lib/merchantSchema";

export const runtime = "edge";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type RelayResponse =
  | { issueUrl: string; editToken: string; editUrl: string; merchantId: string }
  | { error: string; field?: string };

function json(body: RelayResponse, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}

function formatIssueBody(
  payload: ReturnType<typeof submissionPayloadSchema.parse>,
  editUrl: string,
): { title: string; body: string; labels: string[] } {
  const typeTag =
    payload.type === "submit"
      ? "[Merchant]"
      : payload.type === "update"
        ? "[Merchant Update]"
        : "[Merchant Removal]";
  const title = `${typeTag} ${payload.businessName}`;

  const fields: [string, string][] = [
    ["type", payload.type],
    ["merchantId", payload.merchantId ?? ""],
    ["businessName", payload.businessName],
    ["businessBrief", payload.businessBrief],
    ["category", payload.category],
    ["isOnline", String(payload.isOnline)],
    ["country", payload.country ?? ""],
    ["city", payload.city ?? ""],
    ["fullAddress", payload.fullAddress ?? ""],
    ["lat", payload.lat != null ? String(payload.lat) : ""],
    ["lng", payload.lng != null ? String(payload.lng) : ""],
    ["website", payload.website],
    ["logoUrl", payload.logoUrl],
    ["heroImageUrl", payload.heroImageUrl],
    ["promoCode", payload.promoCode ?? ""],
    ["discountDetails", payload.discountDetails],
    ["socialPlatform", payload.socialPlatform ?? ""],
    ["socialHandle", payload.socialHandle ?? ""],
    ["email", payload.email],
  ];

  const yaml = fields
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");

  const body = `<!-- purpleclub-merchant-relay v1 -->
This submission was created automatically by the Purple Club merchant relay.

\`\`\`yaml
${yaml}
\`\`\`

**Merchant edit link (private — shared with merchant only):**
${editUrl}

---
Maintainers: validate the details, then add the \`approved\` label to trigger the auto-PR workflow.`;

  const labels = ["pending-review"];
  if (payload.type === "update") labels.push("merchant-update");
  if (payload.type === "remove") labels.push("merchant-removal");

  return { title, body, labels };
}

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = submissionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json(
      {
        error: first ? first.message : "Invalid payload",
        field: first ? first.path.join(".") : undefined,
      },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const captchaOk = await verifyTurnstile(payload.turnstileToken, ip);
  if (!captchaOk) {
    return json({ error: "Captcha verification failed" }, { status: 400 });
  }

  const resolvedId =
    payload.merchantId ?? (toSlug(payload.businessName) || "new-merchant");

  if (payload.type === "submit") {
    if (merchants.some((m) => m.id === resolvedId)) {
      return json(
        {
          error: `Slug "${resolvedId}" already exists. Add a location or modifier and try again.`,
          field: "businessName",
        },
        { status: 409 },
      );
    }
  }
  if (payload.type === "update" || payload.type === "remove") {
    if (!merchants.some((m) => m.id === resolvedId)) {
      return json(
        {
          error: `No merchant with id "${resolvedId}" exists yet.`,
          field: "merchantId",
        },
        { status: 404 },
      );
    }
  }

  const token = process.env.GITHUB_BOT_PAT;
  const repoFull = process.env.GITHUB_REPO;
  if (!token || !repoFull || !repoFull.includes("/")) {
    return json(
      { error: "Server is missing GitHub relay configuration." },
      { status: 500 },
    );
  }
  const [owner, repo] = repoFull.split("/");

  let editToken: string;
  try {
    editToken = await signEditToken({
      merchantId: resolvedId,
      email: payload.email,
    });
  } catch {
    return json(
      { error: "Server is missing edit-token signing configuration." },
      { status: 500 },
    );
  }

  const origin = request.nextUrl.origin;
  const editUrl = buildEditUrl(origin, editToken);

  const normalisedPayload = {
    ...payload,
    merchantId: resolvedId,
    turnstileToken: undefined,
  } as Record<string, unknown>;
  delete normalisedPayload.turnstileToken;

  const { title, body, labels } = formatIssueBody(
    normalisedPayload as Parameters<typeof formatIssueBody>[0],
    editUrl,
  );

  const octokit = new Octokit({ auth: token });
  let issueUrl: string;
  try {
    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });
    issueUrl = data.html_url;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create GitHub issue";
    return json({ error: message }, { status: 502 });
  }

  // NOTE: v1 deliberately does not send email. When enabling v1.1, add a
  // single resend.emails.send() call here with `editUrl` in the body.

  return json({
    issueUrl,
    editToken,
    editUrl,
    merchantId: resolvedId,
  });
}
