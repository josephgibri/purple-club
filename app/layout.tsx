import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { TopNav } from "@/components/navigation/top-nav";
import { SiteFooter } from "@/components/navigation/site-footer";
import { SolanaProvider } from "@/components/providers/solana-provider";
import { BasePathFetch } from "@/components/base-path-fetch";
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

export const metadata: Metadata = {
  title: "Purple Club",
  description: "Token-gated merchant discount network powered by PBTC.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/purple-club-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/purple-club-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon-32.png",
  },
  appleWebApp: {
    capable: true,
    title: "Purple Club",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#080512",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <BasePathFetch />
        <SolanaProvider>
          <TopNav />
          {children}
          <SiteFooter />
        </SolanaProvider>
      </body>
    </html>
  );
}
