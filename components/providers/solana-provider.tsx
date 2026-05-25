"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";

import { MobileWalletHost } from "@/components/auth/mobile-wallet-host";
import { MobileWalletProvider } from "@/components/auth/mobile-wallet-context";

type SolanaProviderProps = {
  children: React.ReactNode;
};

export function SolanaProvider({ children }: SolanaProviderProps) {
  const endpoint =
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    clusterApiUrl("mainnet-beta");

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  // autoConnect is intentionally off so `useWalletSignIn` can drive the
  // connect → SIWS state machine itself. With autoConnect on, the
  // adapter races the hook on mount and the deep-link auto-resume
  // sometimes lands before `connect()` has a chance to fire, leaving
  // users with a selected-but-disconnected wallet.
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <MobileWalletProvider>
            {children}
            <MobileWalletHost />
          </MobileWalletProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
