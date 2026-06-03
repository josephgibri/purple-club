"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, X, AlertTriangle, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import type { UsePurpleWalletReturn } from "@/hooks/usePurpleWallet";
import { pickConfirmationIndexes } from "@/lib/purple-wallet/keygen";
import { Portal } from "./portal";

/**
 * "auto"    – show unlock if wallet exists, else show create/import menu
 * "menu"    – show the create/import choice screen
 * "create"  – jump straight to create flow
 * "import"  – jump straight to import flow
 * "unlock"  – jump straight to unlock flow
 */
export type PurpleWalletModalMode = "auto" | "menu" | "create" | "import" | "unlock";

type Step =
  | "menu"           // choose create or import
  | "disclaimer"     // non-custodial warning before creation
  | "show-phrase"    // show the 24 words
  | "confirm-phrase" // confirm 3 random words
  | "set-password"   // set password after phrase confirmed
  | "import-phrase"  // paste seed phrase for import
  | "import-password"// set password for imported wallet
  | "unlock"         // enter password to unlock existing wallet
  | "done";

interface Props {
  mode: PurpleWalletModalMode;
  onClose: () => void;
  wallet: UsePurpleWalletReturn;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        autoFocus={autoFocus}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Password"}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm text-white placeholder:text-white/40 focus:border-gold-accent/60 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function PurpleWalletModal({ mode, onClose, wallet }: Props) {
  const { state, createWallet, importWallet, unlock, generateNewPhrase, error, clearError, isLoading } = wallet;

  // Resolve initial step
  const initialStep = (): Step => {
    if (mode === "unlock" || (mode === "auto" && state !== "none")) return "unlock";
    if (mode === "create") return "disclaimer";
    if (mode === "import") return "import-phrase";
    return "menu"; // "auto" + no wallet, or "menu" explicit
  };

  const [step, setStep] = useState<Step>(initialStep);
  const [phrase, setPhrase] = useState("");
  const [importPhraseInput, setImportPhraseInput] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [confirmIndexes, setConfirmIndexes] = useState<number[]>([]);
  const [confirmAnswers, setConfirmAnswers] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  function resetError() {
    setLocalError("");
    clearError();
  }

  // Generate phrase on demand (disclaimer → show-phrase)
  function handleStartCreate() {
    const p = generateNewPhrase();
    setPhrase(p);
    const indexes = pickConfirmationIndexes(p, 3);
    setConfirmIndexes(indexes);
    setConfirmAnswers({});
    setStep("show-phrase");
  }

  function copyPhrase() {
    void navigator.clipboard.writeText(phrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirmPhrase() {
    const words = phrase.trim().split(/\s+/);
    for (const idx of confirmIndexes) {
      if (confirmAnswers[idx]?.trim().toLowerCase() !== words[idx].toLowerCase()) {
        setLocalError(`Word #${idx + 1} is incorrect. Check your backup and try again.`);
        return;
      }
    }
    setLocalError("");
    setStep("set-password");
  }

  async function handleCreate() {
    resetError();
    if (password.length < 8) { setLocalError("Password must be at least 8 characters."); return; }
    if (password !== passwordConfirm) { setLocalError("Passwords don't match."); return; }
    try {
      await createWallet(phrase, password);
      setPhrase(""); // clear from memory
      setStep("done");
    } catch {
      // error shown via useEffect above
    }
  }

  async function handleImport() {
    resetError();
    if (password.length < 8) { setLocalError("Password must be at least 8 characters."); return; }
    if (password !== passwordConfirm) { setLocalError("Passwords don't match."); return; }
    try {
      await importWallet(importPhraseInput, password);
      setImportPhraseInput(""); // clear phrase from state
      setStep("done");
    } catch {
      // error shown via useEffect above
    }
  }

  async function handleUnlock() {
    resetError();
    try {
      await unlock(password);
      // Do NOT call onClose() here. onClose runs the provider's cancel logic
      // with a stale "locked" state value and would reject the pending
      // connection. The provider closes this modal automatically once it
      // observes state === "unlocked".
    } catch {
      // error shown via useEffect above
    }
  }

  const words = phrase.split(" ");

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="relative w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#0A051A] p-6 shadow-2xl shadow-black/60"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-white/40 hover:text-white/80"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* MENU */}
          {step === "menu" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/purple-club-icon.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-lg"
                />
                <h2 className="pc-serif text-2xl font-semibold text-white">Purple Wallet</h2>
              </div>
              <p className="text-sm text-violet-100/65">
                A non-custodial wallet built into Purple Club. Your keys stay in your browser — we never see them.
              </p>
              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { resetError(); setStep("disclaimer"); }}
                  className="rounded-2xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Create new wallet
                </button>
                <button
                  type="button"
                  onClick={() => { resetError(); setStep("import-phrase"); }}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30"
                >
                  Import seed phrase
                </button>
              </div>
            </div>
          )}

          {/* DISCLAIMER */}
          {step === "disclaimer" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={18} />
                <h2 className="font-semibold">Before you continue</h2>
              </div>
              <ul className="space-y-2 text-sm text-violet-100/80">
                <li className="flex gap-2"><span className="mt-0.5 text-gold-accent">✦</span> You will receive a 24-word seed phrase. <strong className="text-white">Write it down and store it safely.</strong></li>
                <li className="flex gap-2"><span className="mt-0.5 text-gold-accent">✦</span> If you lose your seed phrase and forget your password, <strong className="text-white">your wallet cannot be recovered</strong> — by you or by Purple Club.</li>
                <li className="flex gap-2"><span className="mt-0.5 text-gold-accent">✦</span> Purple Club is non-custodial. We never store or see your keys.</li>
                <li className="flex gap-2"><span className="mt-0.5 text-gold-accent">✦</span> Your seed phrase works in any Solana wallet (Phantom, Solflare, etc.).</li>
              </ul>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("menu")}
                  className="flex-1 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 hover:border-white/30"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="flex-1 rounded-2xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110"
                >
                  I understand — create wallet
                </button>
              </div>
            </div>
          )}

          {/* SHOW PHRASE */}
          {step === "show-phrase" && (
            <div className="space-y-4">
              <h2 className="pc-serif text-xl font-semibold text-white">Your seed phrase</h2>
              <p className="text-sm text-violet-100/65">Write these 24 words down in order. You&apos;ll need to confirm 3 of them next.</p>
              <div className="grid grid-cols-3 gap-2">
                {words.map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                    <span className="w-5 text-right text-[10px] text-white/40">{i + 1}.</span>
                    <span className="text-sm font-mono text-white">{word}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={copyPhrase}
                className="flex items-center gap-2 text-xs text-violet-100/55 hover:text-violet-100/85"
              >
                <Copy size={12} />
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { handleStartCreate(); }} className="flex items-center gap-1.5 text-xs text-violet-100/55 hover:text-violet-100/85"><RefreshCw size={12} /> Regenerate</button>
                <button
                  type="button"
                  onClick={() => setStep("confirm-phrase")}
                  className="ml-auto rounded-2xl bg-gold-accent px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
                >
                  I&apos;ve written it down →
                </button>
              </div>
            </div>
          )}

          {/* CONFIRM PHRASE */}
          {step === "confirm-phrase" && (
            <div className="space-y-4">
              <h2 className="pc-serif text-xl font-semibold text-white">Confirm your backup</h2>
              <p className="text-sm text-violet-100/65">Enter the words at the following positions to confirm you&apos;ve saved your phrase.</p>
              <div className="space-y-3">
                {confirmIndexes.map((idx) => (
                  <label key={idx} className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                    Word #{idx + 1}
                    <input
                      type="text"
                      autoCapitalize="off"
                      autoComplete="off"
                      spellCheck={false}
                      value={confirmAnswers[idx] ?? ""}
                      onChange={(e) => setConfirmAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-gold-accent/60 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
              {localError && <p className="text-xs text-red-300">{localError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { resetError(); setStep("show-phrase"); }} className="flex-1 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 hover:border-white/30">Back</button>
                <button type="button" onClick={handleConfirmPhrase} className="flex-1 rounded-2xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110">Confirm</button>
              </div>
            </div>
          )}

          {/* SET PASSWORD (create) */}
          {step === "set-password" && (
            <div className="space-y-4">
              <h2 className="pc-serif text-xl font-semibold text-white">Set a password</h2>
              <p className="text-sm text-violet-100/65">Used to unlock your wallet on this device. Your seed phrase remains the master recovery key.</p>
              <PasswordInput value={password} onChange={setPassword} placeholder="Password (min 8 chars)" autoFocus />
              <PasswordInput value={passwordConfirm} onChange={setPasswordConfirm} placeholder="Confirm password" />
              {localError && <p className="text-xs text-red-300">{localError}</p>}
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={isLoading}
                className="w-full rounded-2xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {isLoading ? "Creating wallet…" : "Create wallet"}
              </button>
            </div>
          )}

          {/* IMPORT PHRASE */}
          {step === "import-phrase" && (
            <div className="space-y-4">
              <h2 className="pc-serif text-xl font-semibold text-white">Import seed phrase</h2>
              <p className="text-sm text-violet-100/65">Enter your 24-word BIP39 mnemonic. Phantom uses the same derivation path (m/44&apos;/501&apos;/0&apos;/0&apos;) so your address will match.</p>
              <textarea
                rows={4}
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="word1 word2 word3 … word24"
                value={importPhraseInput}
                onChange={(e) => setImportPhraseInput(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder:text-white/40 focus:border-gold-accent/60 focus:outline-none"
              />
              {localError && <p className="text-xs text-red-300">{localError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { resetError(); setStep("menu"); }} className="flex-1 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 hover:border-white/30">Back</button>
                <button
                  type="button"
                  onClick={() => {
                    if (!wallet.validatePhrase(importPhraseInput)) {
                      setLocalError("Invalid seed phrase. Check every word and try again.");
                      return;
                    }
                    resetError();
                    setStep("import-password");
                  }}
                  className="flex-1 rounded-2xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* IMPORT PASSWORD */}
          {step === "import-password" && (
            <div className="space-y-4">
              <h2 className="pc-serif text-xl font-semibold text-white">Set a password</h2>
              <p className="text-sm text-violet-100/65">Encrypts your imported key on this device.</p>
              <PasswordInput value={password} onChange={setPassword} placeholder="Password (min 8 chars)" autoFocus />
              <PasswordInput value={passwordConfirm} onChange={setPasswordConfirm} placeholder="Confirm password" />
              {localError && <p className="text-xs text-red-300">{localError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { resetError(); setStep("import-phrase"); }} className="flex-1 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 hover:border-white/30">Back</button>
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={isLoading}
                  className="flex-1 rounded-2xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
                >
                  {isLoading ? "Importing…" : "Import wallet"}
                </button>
              </div>
            </div>
          )}

          {/* UNLOCK */}
          {step === "unlock" && (
            <div className="space-y-4">
              <h2 className="pc-serif text-xl font-semibold text-white">Unlock Purple Wallet</h2>
              <p className="text-sm text-violet-100/65">Enter your password to unlock.</p>
              <PasswordInput value={password} onChange={setPassword} placeholder="Password" autoFocus />
              {localError && <p className="text-xs text-red-300">{localError}</p>}
              <button
                type="button"
                onClick={() => void handleUnlock()}
                disabled={isLoading}
                className="w-full rounded-2xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {isLoading ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          )}

          {/* DONE */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 size={40} className="text-emerald-400" />
              <h2 className="pc-serif text-2xl font-semibold text-white">Wallet ready</h2>
              <p className="text-sm text-violet-100/65">Your Purple Wallet is set up and unlocked. You can use it to sign in and pay across the club.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 rounded-full bg-gold-accent px-6 py-2.5 text-sm font-semibold text-black hover:brightness-110"
              >
                Get started
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
