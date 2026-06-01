type IconProps = { className?: string };

function SaveIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 2.5c-2.4 3-4.5 4.5-7 5 0 6.2 3.4 11.6 7 14 3.6-2.4 7-7.8 7-14-2.5-.5-4.6-2-7-5z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </svg>
  );
}

function BookIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6.5h13.5a2.5 2.5 0 0 1 2.5 2.5v10.5H6a3 3 0 0 1-3-3V6.5z" />
      <path d="M3 6.5a3 3 0 0 1 3-3h10v13H6a3 3 0 0 0-3 3" />
      <path d="M7.5 8.5h7" />
    </svg>
  );
}

function BurnIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.6.7-2.6 1.5-3.5C10.5 6 11.5 4.5 12 3z" />
      <path d="M10.5 17.5c.5 1.5 2 2.5 4 2" />
    </svg>
  );
}

function ArrowIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

const STAGES = [
  {
    title: "Save",
    detail: "Wholesale rates, up to 20% off retail.",
    Icon: SaveIcon,
  },
  {
    title: "Book",
    detail: "Pay with card or USDC at checkout.",
    Icon: BookIcon,
  },
  {
    title: "Burn",
    detail: "0.25% of every booking buys & burns PBTC — more during boost months.",
    Icon: BurnIcon,
  },
] as const;

type Variant = "compact" | "feature";

type Props = {
  variant?: Variant;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  className?: string;
};

export function SaveBookBurnLoop({
  variant = "compact",
  eyebrow,
  title,
  subtitle,
  className = "",
}: Props) {
  const isFeature = variant === "feature";

  return (
    <section
      className={`pt-glass-strong rounded-2xl p-6 sm:p-8 ${className}`}
      aria-label="Save Book Burn loop"
    >
      {(eyebrow || title || subtitle) && (
        <div className={isFeature ? "mb-6 sm:mb-8" : "mb-5"}>
          {eyebrow ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308]" />
              {eyebrow}
            </span>
          ) : null}
          {title ? (
            <h2
              className={`pt-serif mt-3 font-semibold text-white ${
                isFeature ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
              }`}
            >
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65">{subtitle}</p>
          ) : null}
        </div>
      )}

      <div className="grid items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {STAGES.map((stage, i) => (
          <div key={stage.title} className="contents">
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="flex items-center gap-3">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#EAB308]/45 bg-gradient-to-br from-[#EAB308]/20 via-[#7C3AED]/10 to-transparent text-[#FDE047] shadow-[0_0_28px_-6px_rgba(234,179,8,0.45)]">
                  <stage.Icon className="h-5 w-5" />
                  <span className="absolute -inset-px rounded-2xl border border-white/5" />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                    Step {String(i + 1).padStart(2, "0")}
                  </p>
                  <p className="pt-serif text-base font-semibold text-white">{stage.title}</p>
                </div>
              </div>
              <p className="text-xs leading-5 text-white/60">{stage.detail}</p>
            </div>

            {i < STAGES.length - 1 ? (
              <div className="flex items-center justify-center text-[#EAB308]/70">
                <ArrowIcon className="hidden h-5 w-5 sm:block" />
                <ArrowIcon className="h-5 w-5 rotate-90 sm:hidden" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/40">
        <span aria-hidden>↺</span>
        Supply shrinks, key gets scarcer
      </p>
    </section>
  );
}
