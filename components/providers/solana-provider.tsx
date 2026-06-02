"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

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

  // Phantom, Solflare, Backpack and any other Wallet Standard wallets
  // auto-register themselves without needing an explicit adapter entry.
  // Passing an empty array avoids the "Phantom was registered as a Standard
  // Wallet — the adapter can be removed" console warning.
  //
  // autoConnect is intentionally off so `useWalletSignIn` can drive the
  // connect → SIWS state machine itself. With autoConnect on, the
  // adapter races the hook on mount and the deep-link auto-resume
  // sometimes lands before `connect()` has a chance to fire, leaving
  // users with a selected-but-disconnected wallet.
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect={false}>
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
