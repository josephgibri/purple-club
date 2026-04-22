"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function Page() {
  return (
    <Suspense fallback={<Shell>Loading…</Shell>}>
      <Submitted />
    </Suspense>
  );
}

function Submitted() {
  const params = useSearchParams();
  const issueUrl = params.get("issue") ?? "";
  const editUrl = params.get("edit") ?? "";
  const merchantId = params.get("merchant") ?? "";

  const [copied, setCopied] = useState(false);

  async function copyEditLink() {
    if (!editUrl) return;
    try {
      await navigator.clipboard.writeText(editUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  function downloadText() {
    if (!editUrl) return;
    const body = [
      "Purple Club — Merchant Edit Link",
      "",
      `Merchant: ${merchantId}`,
      `Edit URL: ${editUrl}`,
      "",
      "Keep this link private. It is the only way to update or remove your",
      "listing until email recovery is enabled.",
      "",
      "If you lose this link, DM @purpleclubhq on Telegram or @purpleclub on X",
      "with the email you submitted and we will regenerate a new link for you.",
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purple-club-edit-link-${merchantId || "merchant"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-accent">
        Submission received
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Thanks — your listing is under review
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-violet-100/80">
        We just opened a tracking issue on GitHub. A Purple Club maintainer
        will review the details, then approve it to publish the merchant live.
      </p>

      {issueUrl ? (
        <a
          href={issueUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-surface-muted px-4 py-2 text-sm hover:border-purple-accent"
        >
          View public tracking issue →
        </a>
      ) : null}

      <div className="mt-8 rounded-2xl border border-gold-accent/50 bg-gold-accent/10 p-5">
        <p className="text-sm font-semibold text-gold-accent">
          Save this link — it is the only way to edit your listing
        </p>
        <p className="mt-2 text-xs text-violet-100/80">
          Email recovery is coming in v1.1. Until then, this link is your edit
          credential. Bookmark it, copy it, or save it as a text file.
        </p>
        {editUrl ? (
          <div className="mt-3 break-all rounded-lg border border-border bg-[#0b0618] p-3 font-mono text-xs text-violet-100">
            {editUrl}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void copyEditLink()}
            className="rounded-xl bg-gold-accent px-4 py-2 text-sm font-semibold text-black"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={downloadText}
            className="rounded-xl border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-violet-100/90 hover:border-purple-accent"
          >
            Save as text file
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface-muted p-4 text-xs text-violet-100/70">
        Lost your link later? DM{" "}
        <span className="font-semibold text-violet-100">@purpleclubhq on Telegram</span>{" "}
        or{" "}
        <span className="font-semibold text-violet-100">@purpleclub on X</span>{" "}
        with the email you submitted. A maintainer will regenerate a fresh edit
        link for you within minutes.
      </div>

      <div className="mt-6 text-sm text-violet-100/70">
        <Link href="/" className="underline underline-offset-4">
          Back to Purple Club
        </Link>
      </div>
    </Shell>
  );
}

function Shell(props: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        {props.children}
      </div>
    </main>
  );
}
