import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopNav } from "@/components/navigation/top-nav";
import { SolanaProvider } from "@/components/providers/solana-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Purple Club",
  description: "Token-gated merchant discount network powered by PBTC.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/purple-club-icon.png",
    apple: "/purple-club-icon.png",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SolanaProvider>
          <TopNav />
          {children}
        </SolanaProvider>
      </body>
    </html>
  );
}
