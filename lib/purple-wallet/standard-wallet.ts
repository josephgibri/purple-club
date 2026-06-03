/**
 * Wallet Standard implementation for Purple Wallet.
 *
 * Registering this on the window makes @solana/wallet-adapter-react discover
 * Purple Wallet exactly like Phantom or Solflare — so it appears in the
 * sign-in modal, SIWS works through useWalletAuth, and USDC payments work
 * through UsdcPayButton, all with no changes to those consumers.
 *
 * The wallet object is static (lives outside React). It delegates the actual
 * signing + unlocking to the bridge singleton, which the PurpleWalletProvider
 * keeps in sync with the live in-memory keypair.
 */

import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type {
  Wallet,
  WalletAccount,
  WalletIcon,
} from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardConnectMethod,
  StandardDisconnectFeature,
  StandardDisconnectMethod,
  StandardEventsFeature,
  StandardEventsListeners,
  StandardEventsNames,
  StandardEventsOnMethod,
} from "@wallet-standard/features";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
} from "@wallet-standard/features";
import type {
  SolanaSignMessageFeature,
  SolanaSignMessageMethod,
  SolanaSignTransactionFeature,
  SolanaSignTransactionMethod,
} from "@solana/wallet-standard-features";
import {
  SolanaSignMessage,
  SolanaSignTransaction,
} from "@solana/wallet-standard-features";

import {
  getPurpleWalletBridge,
  onPurpleAccountChange,
} from "./bridge";

const SOLANA_MAINNET_CHAIN = "solana:mainnet" as const;

// Small inline purple diamond icon (data URI required by Wallet Standard).
const ICON: WalletIcon =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzJlMTA2NSIvPjxwYXRoIGQ9Ik0xNiA2bDcgMTAtNyAxMC03LTEweiIgZmlsbD0iI2Y2YzQ1MyIvPjwvc3ZnPg==";

class PurpleWalletAccount implements WalletAccount {
  readonly #address: string;
  readonly #publicKey: Uint8Array;

  constructor(address: string) {
    this.#address = address;
    this.#publicKey = new PublicKey(address).toBytes();
  }

  get address() {
    return this.#address;
  }
  get publicKey() {
    return this.#publicKey.slice();
  }
  get chains() {
    return [SOLANA_MAINNET_CHAIN] as const;
  }
  get features() {
    return [SolanaSignMessage, SolanaSignTransaction] as const;
  }
  get label() {
    return "Purple Wallet";
  }
  get icon() {
    return ICON;
  }
}

class PurpleStandardWallet implements Wallet {
  readonly #listeners: {
    [E in StandardEventsNames]?: StandardEventsListeners[E][];
  } = {};
  #account: PurpleWalletAccount | null = null;

  constructor() {
    // Keep our account list in sync with the React provider's unlocked state.
    onPurpleAccountChange((address) => {
      const had = this.#account?.address ?? null;
      if (address === had) return;
      this.#account = address ? new PurpleWalletAccount(address) : null;
      this.#emit("change", { accounts: this.accounts });
    });
  }

  get version() {
    return "1.0.0" as const;
  }
  get name() {
    return "Purple Wallet" as const;
  }
  get icon() {
    return ICON;
  }
  get chains() {
    return [SOLANA_MAINNET_CHAIN] as const;
  }

  get features(): StandardConnectFeature &
    StandardDisconnectFeature &
    StandardEventsFeature &
    SolanaSignMessageFeature &
    SolanaSignTransactionFeature {
    return {
      [StandardConnect]: { version: "1.0.0", connect: this.#connect },
      [StandardDisconnect]: { version: "1.0.0", disconnect: this.#disconnect },
      [StandardEvents]: { version: "1.0.0", on: this.#on },
      [SolanaSignMessage]: { version: "1.0.0", signMessage: this.#signMessage },
      [SolanaSignTransaction]: {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: this.#signTransaction,
      },
    };
  }

  get accounts() {
    return this.#account ? [this.#account] : [];
  }

  #on: StandardEventsOnMethod = (event, listener) => {
    const list = (this.#listeners[event] ||= []) as StandardEventsListeners[typeof event][];
    list.push(listener);
    return () => this.#off(event, listener);
  };

  // We only ever emit the "change" event, so type it concretely to avoid
  // the generic-spread limitation.
  #emit(event: "change", properties: Parameters<StandardEventsListeners["change"]>[0]) {
    const list = (this.#listeners[event] ?? []) as StandardEventsListeners["change"][];
    for (const listener of list) {
      listener(properties);
    }
  }

  #off<E extends StandardEventsNames>(
    event: E,
    listener: StandardEventsListeners[E],
  ) {
    const list = (this.#listeners[event] ?? []) as StandardEventsListeners[E][];
    this.#listeners[event] = list.filter((l) => l !== listener) as never;
  }

  #connect: StandardConnectMethod = async ({ silent } = {}) => {
    const bridge = getPurpleWalletBridge();
    if (!bridge) throw new Error("Purple Wallet is not ready.");

    if (silent) {
      // Only connect without UI if already unlocked.
      const addr = bridge.isUnlocked() ? bridge.getAddress() : null;
      if (addr) this.#account = new PurpleWalletAccount(addr);
    } else {
      const addr = await bridge.ensureUnlocked();
      this.#account = new PurpleWalletAccount(addr);
    }

    if (this.#account) this.#emit("change", { accounts: this.accounts });
    return { accounts: this.accounts };
  };

  #disconnect: StandardDisconnectMethod = async () => {
    this.#account = null;
    this.#emit("change", { accounts: this.accounts });
  };

  #signMessage: SolanaSignMessageMethod = async (...inputs) => {
    const bridge = getPurpleWalletBridge();
    if (!bridge) throw new Error("Purple Wallet is not ready.");
    const outputs: { signedMessage: Uint8Array; signature: Uint8Array }[] = [];
    for (const { message } of inputs) {
      const signature = await bridge.signMessage(message);
      outputs.push({ signedMessage: message, signature });
    }
    return outputs;
  };

  #signTransaction: SolanaSignTransactionMethod = async (...inputs) => {
    const bridge = getPurpleWalletBridge();
    if (!bridge) throw new Error("Purple Wallet is not ready.");

    const outputs: { signedTransaction: Uint8Array }[] = [];
    for (const { transaction } of inputs) {
      // Try versioned first, fall back to legacy.
      let signedBytes: Uint8Array;
      try {
        const vtx = VersionedTransaction.deserialize(transaction);
        const signed = await bridge.signTransaction(vtx);
        signedBytes = signed.serialize();
      } catch {
        const legacy = Transaction.from(transaction);
        const signed = await bridge.signTransaction(legacy);
        signedBytes = signed.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
      }
      outputs.push({ signedTransaction: signedBytes });
    }
    return outputs;
  };
}

let registered = false;

/**
 * Register Purple Wallet as a Wallet Standard wallet. Idempotent and guarded
 * so a failure can never break detection of Phantom/Solflare. Safe to call
 * from a client component effect.
 */
export function registerPurpleStandardWallet() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  void (async () => {
    try {
      const { registerWallet } = await import("@wallet-standard/wallet");
      registerWallet(new PurpleStandardWallet());
    } catch {
      // Registration failed — Purple Wallet just won't appear in the adapter
      // list. The standalone /account wallet card still works.
      registered = false;
    }
  })();
}
