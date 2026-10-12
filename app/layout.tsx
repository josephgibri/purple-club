import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Oswald, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import { TopNav } from "@/components/navigation/top-nav";
import { SiteFooter } from "@/components/navigation/site-footer";
import { Atmosphere } from "@/components/shell/atmosphere";
import { SolanaProvider } from "@/components/providers/solana-provider";
import { BasePathFetch } from "@/components/base-path-fetch";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Playfair Display backs the `.pc-serif` utility — same serif used as
// the wordmark font in Purple Lending and Purple Council so the
// Purple ecosystem reads as one product family.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const oswald = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Purple Club",
  description: "Hold 1 PBTC. Get the member price.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/dog-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/dog-icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/dog-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/dog-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/dog-icon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/brand/dog-icon-32.png",
  },
  appleWebApp: {
    capable: true,
    title: "Purple Club",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0B14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--wall)] pt-14 text-[var(--bone)]">
        <Atmosphere />
        <BasePathFetch />
        <SolanaProvider>
          <TopNav />
          <div className="relative z-10 flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </SolanaProvider>
        <InstallPrompt />
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
