import type { Metadata } from "next";

import { StickerClient } from "./sticker-client";

export const metadata: Metadata = {
  title: "Window sticker · Purple Club",
  description:
    "Download or print a Purple Club member-merchant sticker for your shop window.",
};

type StickerPageProps = {
  searchParams: Promise<{ merchant?: string }>;
};

export default async function StickerPage({ searchParams }: StickerPageProps) {
  const { merchant } = await searchParams;
  const merchantId =
    typeof merchant === "string" && merchant.length > 0 ? merchant : null;
  return <StickerClient merchantId={merchantId} />;
}
