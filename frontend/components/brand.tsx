import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="ONCE home"
      className="relative inline-flex shrink-0 items-baseline leading-none"
    >
      <span
        className={`font-extrabold tracking-[-0.055em] text-foreground ${
          compact ? "text-[24px]" : "text-[27px]"
        }`}
      >
        once.
      </span>
      <svg
        viewBox="0 0 64 10"
        className="absolute -bottom-[7px] left-[2px] h-[9px] w-[58px] text-warm"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 6.2c12.5 4 35.5 4 56-1.3"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M54.5 2.6 60 4.6l-4.4 3.4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

export function Avatar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative inline-grid size-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#f7d9b8] via-[#f3bd8d] to-[#d98c5f] text-[17px] shadow-[0_2px_8px_rgba(120,72,35,0.18)] ring-2 ring-white/80 ${className}`}
      aria-hidden="true"
    >
      <span className="translate-y-[1px]">👩🏻</span>
    </span>
  );
}

export type OrbState = "idle" | "listening" | "speaking";

export function Orb({
  small = false,
  state = "idle",
  onActivate,
  ariaLabel,
}: {
  small?: boolean;
  state?: OrbState;
  onActivate?: () => void;
  ariaLabel?: string;
}) {
  const interactive = typeof onActivate === "function";
  const pulseClass =
    state === "listening" ? "orb-breathe-fast" : state === "speaking" ? "orb-breathe-slow" : "";
  const glowClass = state === "idle" ? "" : "orb-glow-live";
  const body = (
    <>
      <div className={`orb-glow${small ? " scale-75" : ""}${glowClass ? ` ${glowClass}` : ""}`} />
      <span className="orb-spark left-[16%] top-[24%]" />
      <span className="orb-spark right-[14%] top-[34%] h-1.5 w-1.5" />
      <span className="orb-spark bottom-[20%] right-[22%] h-1 w-1" />
      <div className={`orb${small ? " scale-[0.62]" : ""}${pulseClass ? ` ${pulseClass}` : ""}`}>
        <span className="orb-smile" />
      </div>
    </>
  );
  if (!interactive) {
    return <div className={small ? "orb-stage min-h-[120px]" : "orb-stage"}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={state !== "idle"}
      aria-label={ariaLabel ?? "Talk to ONCE"}
      className={`orb-stage${small ? " min-h-[120px]" : ""} orb-interactive`}
    >
      {body}
    </button>
  );
}
