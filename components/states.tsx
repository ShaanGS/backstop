"use client";

import { BrandMark, Glyph, PATHS } from "./icons";
import { cn } from "@/lib/utils";

/* Loading, thinking and empty states. The agent is slow by nature — it is doing
 * real API work — so every wait is given a shape that says what is happening. */

export function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className={cn("relative block overflow-hidden rounded-[6px] bg-inset", className)} style={style}>
      <span aria-hidden className="absolute inset-0 -translate-x-full"
        style={{
          background: "linear-gradient(90deg, transparent, var(--hover), transparent)",
          animation: "shimmer 1.6s ease-in-out infinite",
        }} />
    </span>
  );
}

export function AccountSkeleton({ i }: { i: number }) {
  return (
    <div className="rounded-card p-2.5" style={{ animation: `fade-in 400ms ease-out ${i * 70}ms both` }}>
      <div className="flex items-center gap-2">
        <Shimmer className="size-1.5 rounded-full" />
        <Shimmer className="h-3 flex-1" style={{ maxWidth: `${60 + ((i * 13) % 30)}%` }} />
        <Shimmer className="h-3 w-5" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Shimmer className="h-2.5 w-12" />
        <Shimmer className="h-2.5 w-7" />
        <Shimmer className="ml-auto h-3.5 w-[52px]" />
      </div>
    </div>
  );
}

/** Tool calls as chips, with the in-flight one still pulsing. */
export function ToolTrace({ calls }: { calls: { id: string; name: string; summary?: string }[] }) {
  if (!calls.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((c, i) => (
        <span key={c.id} title={c.summary}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-chip px-2 font-mono text-[10.5px] shadow-hairline transition-colors duration-200",
            c.summary ? "bg-inset text-ink-2" : "bg-accent-tint text-accent-ink",
          )}
          style={{ animation: `pop-in 240ms var(--ease-out) ${Math.min(i, 8) * 35}ms both` }}>
          {c.summary ? (
            <span className="flex size-3 items-center justify-center text-green"><Glyph d={PATHS.check} size={9} weight="strong" /></span>
          ) : (
            <span className="size-1.5 rounded-full bg-current" style={{ animation: "pulse-ring 1.2s ease-out infinite" }} />
          )}
          {c.name}
          {c.summary && <span className="text-ink-3">· {c.summary}</span>}
        </span>
      ))}
    </div>
  );
}

export function ConnectorRow({
  c,
}: {
  c: { id: string; name: string; role: string; direction: string; configured: boolean; whenMissing?: string };
}) {
  return (
    <div
      title={c.configured ? `${c.name} · ${c.direction} · ${c.role}` : c.whenMissing}
      className="group flex items-start gap-2 rounded-[8px] px-1.5 py-1.5 transition-colors duration-150 hover:bg-hover-2"
    >
      <span
        className={cn(
          "mt-px flex size-4 shrink-0 items-center justify-center transition-opacity duration-200",
          !c.configured && "opacity-35 grayscale",
        )}
      >
        <BrandMark id={c.id} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-[12px]", c.configured ? "text-ink" : "text-ink-3")}>{c.name}</span>
          <span className="shrink-0 font-mono text-[9px] tracking-tight text-ink-3">{c.direction}</span>
          <span
            className={cn("ml-auto size-1.5 shrink-0 rounded-full", c.configured ? "bg-green" : "bg-line-strong")}
          />
        </span>
        {/* What it is for, not just that it exists. An unconfigured connector
            says what the operator loses, so a grey dot is never a mystery. */}
        <span className={cn("mt-0.5 block text-[10.5px] leading-[1.35]", c.configured ? "text-ink-3" : "text-ink-3/70")}>
          {c.configured ? c.role : "Not connected"}
        </span>
      </span>
    </div>
  );
}
