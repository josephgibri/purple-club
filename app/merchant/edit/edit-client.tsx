"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  MerchantForm,
  type MerchantFormInitial,
  type MerchantFormResult,
} from "@/components/join/merchant-form";

type EditClientProps = {
  initial: MerchantFormInitial;
  merchantId: string;
  merchantExists: boolean;
};

export function EditClient({ initial, merchantId, merchantExists }: EditClientProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSuccess(result: MerchantFormResult) {
    const params = new URLSearchParams({
      issue: result.issueUrl,
      edit: result.editUrl,
      merchant: result.merchantId,
    });
    router.push(`/merchant/submitted?${params.toString()}`);
  }

  async function requestRemoval() {
    if (!window.confirm("Are you sure you want to request removal of this listing?")) return;
    setError(null);
    setIsRemoving(true);
    try {
      const payload = {
        type: "remove",
        merchantId,
        businessName: initial.businessName ?? merchantId,
        businessBrief: initial.businessBrief ?? "Removal request",
        category: initial.category ?? "retail_goods",
        isOnline: initial.isOnline ?? false,
        country: initial.country ?? "",
        city: initial.city ?? "",
        fullAddress: initial.fullAddress ?? "",
        website: initial.website ?? "https://removal.invalid/",
        logoUrl: initial.logoUrl ?? "https://removal.invalid/logo.png",
        heroImageUrl: initial.heroImageUrl ?? "https://removal.invalid/hero.png",
        promoCode: initial.promoCode ?? "",
        discountDetails: initial.discountDetails ?? "Removal request",
        email: initial.email,
        turnstileToken: "edit-remove",
      };
      const res = await fetch("/api/submit-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | MerchantFormResult
        | { error: string };
      if (!res.ok || !("issueUrl" in data)) {
        setError((data as { error: string }).error || "Removal request failed");
        setIsRemoving(false);
        return;
      }
      onSuccess(data);
    } catch {
      setError("Network error — please retry");
      setIsRemoving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-accent">
          Merchant edit
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Update your Purple Club listing
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-violet-100/75">
          Changes submit a tracked update issue. A maintainer reviews and
          approves to publish.
        </p>

        {!merchantExists ? (
          <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            Your listing has not yet been published — edits here will attach to
            your pending submission.
          </div>
        ) : null}

        <div className="mt-8">
          <MerchantForm
            mode="update"
            initial={initial}
            onSuccess={onSuccess}
            showRemoveAction={merchantExists}
            onRemove={() => void requestRemoval()}
            submitLabel="Submit update"
          />
        </div>

        {isRemoving ? (
          <p className="mt-4 text-sm text-violet-100/80">Submitting removal…</p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-rose-300">{error}</p>
        ) : null}

        <div className="mt-6 rounded-xl border border-border bg-surface-muted p-4 text-xs text-violet-100/70">
          Lost your link later? DM{" "}
          <span className="font-semibold text-violet-100">@purpleclubhq on Telegram</span>{" "}
          or{" "}
          <span className="font-semibold text-violet-100">@purpleclub on X</span>{" "}
          with the email you submitted. A maintainer will regenerate a fresh
          edit link for you.
        </div>

        <div className="mt-6 text-sm text-violet-100/70">
          <Link href="/" className="underline underline-offset-4">
            Back to Purple Club
          </Link>
        </div>
      </div>
    </main>
  );
}
