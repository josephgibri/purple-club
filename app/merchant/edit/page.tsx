import Link from "next/link";

import { EditClient } from "./edit-client";
import { merchants } from "@/data/merchants";
import { verifyEditToken } from "@/lib/editToken";
import type { MerchantFormInitial } from "@/components/join/merchant-form";

type PageProps = {
  searchParams: Promise<{ t?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { t } = await searchParams;
  if (!t) return <RecoveryShell reason="missing" />;

  let claims: { merchantId: string; email: string };
  try {
    claims = await verifyEditToken(t);
  } catch {
    return <RecoveryShell reason="invalid" />;
  }

  const merchant = merchants.find((m) => m.id === claims.merchantId);
  const initial: MerchantFormInitial = merchant
    ? {
        merchantId: merchant.id,
        businessName: merchant.name,
        businessBrief: merchant.description,
        category: merchant.category,
        isOnline: merchant.isOnline,
        country: merchant.country,
        city: merchant.city,
        fullAddress: merchant.fullAddress,
        lat: merchant.lat,
        lng: merchant.lng,
        website: merchant.ctaHref ?? "",
        logoUrl: merchant.logoUrl,
        heroImageUrl: merchant.heroImageUrl,
        promoCode: merchant.promoCode ?? "",
        discountDetails: merchant.discount,
        socialPlatform: merchant.socialPlatform,
        socialHandle: merchant.socialHandle,
        email: claims.email,
      }
    : {
        merchantId: claims.merchantId,
        email: claims.email,
      };

  return (
    <EditClient
      initial={initial}
      merchantId={claims.merchantId}
      merchantExists={Boolean(merchant)}
    />
  );
}

function RecoveryShell({ reason }: { reason: "missing" | "invalid" }) {
  const headline =
    reason === "missing" ? "Edit link missing" : "Edit link invalid or expired";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-accent">
          Merchant edit
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{headline}</h1>
        <div className="mt-6 rounded-xl border border-border bg-surface-muted p-4 text-sm text-violet-100/80">
          <p className="font-semibold text-violet-100">Lost your link?</p>
          <p className="mt-2">
            DM <span className="font-semibold">@purpleclubhq on Telegram</span>{" "}
            or <span className="font-semibold">@purpleclub on X</span> with the
            email you used when submitting. A maintainer will regenerate a
            fresh edit link for you within minutes.
          </p>
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
