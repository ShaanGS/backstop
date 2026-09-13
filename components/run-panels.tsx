"use client";

import { Glyph, PATHS } from "./icons";
import { cn, money, pct } from "@/lib/utils";
import type { PolicyDecision, ProposedAction } from "@/lib/types";


/* ── tool calls as they happen ───────────────────────────────────────────── */

export function ToolTrace({ calls }: { calls: { id: string; name: string; summary?: string }[] }) {
  if (!calls.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((c, i) => (
        <span key={c.id} title={c.summary}
          className="inline-flex h-6 items-center gap-1.5 rounded-chip bg-inset px-2 font-mono text-[11px] text-ink-2 shadow-hairline"
          style={{ animation: `pop-in 240ms cubic-bezier(0.23,1,0.32,1) ${i * 40}ms both` }}>
          <span className={cn("size-1.5 rounded-full", c.summary ? "bg-green" : "bg-accent")}
            style={c.summary ? undefined : { animation: "pulse-ring 1.2s ease-out infinite" }} />
          {c.name}
          {c.summary && <span className="text-ink-3">· {c.summary}</span>}
        </span>
      ))}
    </div>
  );
}

/* ── evidence, each item citing the app it came from ─────────────────────── */


/* ── policy decisions ────────────────────────────────────────────────────── */

const OUTCOME: Record<string, { cls: string; icon: string; label: string }> = {
  allow: { cls: "text-green bg-green-tint", icon: PATHS.check, label: "Allowed" },
  block: { cls: "text-red bg-red-tint", icon: PATHS.lock, label: "Blocked" },
  require_approval: { cls: "text-amber bg-amber-tint", icon: PATHS.pause, label: "Needs approval" },
};

export function PolicyPanel({ decisions }: { decisions: PolicyDecision[] }) {
  if (!decisions.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {decisions.map((d, i) => {
        const o = OUTCOME[d.outcome];
        return (
          <div key={d.rule + i} className="flex items-start gap-2.5 rounded-card bg-surface p-2.5 shadow-card"
            style={{ animation: `fade-up 340ms cubic-bezier(0.23,1,0.32,1) ${i * 60}ms both` }}>
            <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full", o.cls)}>
              <Glyph d={o.icon} size={11} strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11.5px] font-medium text-ink">{d.rule}</span>
                <span className={cn("inline-flex h-4.5 items-center rounded-full px-1.5 text-[10.5px] font-medium", o.cls)}>
                  {o.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{d.reason}</p>
              {d.evidence && <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">{d.evidence}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── the human approval gate ─────────────────────────────────────────────── */

export function ApprovalGate({
  rule, reason, actions, busy, onDecide,
}: {
  rule: string; reason: string; actions: ProposedAction[]; busy: boolean;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div className="rounded-card bg-surface p-3.5 shadow-raised" style={{ animation: "pop-in 280ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-amber-tint text-amber">
          <Glyph d={PATHS.pause} size={13} strokeWidth={2.4} />
        </span>
        <p className="text-[13px] font-semibold text-ink">Waiting on a human</p>
        <span className="ml-auto font-mono text-[11px] text-ink-3">{rule}</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{reason}</p>
      <div className="mt-2.5 flex flex-col gap-1 rounded-[10px] bg-inset p-2">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] text-ink-2">
            <span className="size-1.5 shrink-0 rounded-full bg-ink-3" />
            {a.summary}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => onDecide(true)}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-ink text-[12.5px] font-medium text-surface transition-[transform,opacity] duration-150 enabled:active:scale-[0.98] disabled:opacity-50">
          {busy ? "Executing…" : `Approve & run ${actions.length} actions`}
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide(false)}
          className="flex h-8 items-center justify-center rounded-[9px] bg-inset px-3 text-[12.5px] font-medium text-ink-2 shadow-hairline transition-colors duration-150 hover:text-ink disabled:opacity-50">
          Reject
        </button>
      </div>
    </div>
  );
}

/* ── account cards in the left rail ──────────────────────────────────────── */

export type AccountRow = {
  id: string; name: string; domain: string; tags: string[];
  riskScore: number; riskReasons: string[]; mrrCents: number;
  daysToRenewal: number; failedPaymentCents: number | null;
  usage: { changePct: number; series: number[] };
};


export function AccountCard({ a, active, onClick }: { a: AccountRow; active: boolean; onClick: () => void }) {
  const tone = a.riskScore >= 70 ? "red" : a.riskScore >= 40 ? "amber" : "green";
  const dnc = a.tags.includes("do-not-contact");

  /* One line, in the order a person would ask: how bad, how soon, how much.
     The old card stacked three rows of monospace figures and read like a
     terminal dump — the number you actually act on was the hardest to find. */
  const line = `${money(a.mrrCents)}/mo  ·  renews ${a.daysToRenewal}d`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors duration-150",
        active ? "bg-surface shadow-card" : "hover:bg-hover-2",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold",
          tone === "red" ? "bg-red-tint text-red" : tone === "amber" ? "bg-amber-tint text-amber" : "bg-green-tint text-green",
        )}
      >
        {a.name.slice(0, 1)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-ink">{a.name}</span>
          <span className={cn("shrink-0 text-[11px] font-medium tabular-nums",
            a.usage.changePct < 0 ? "text-red" : "text-green")}>{pct(a.usage.changePct)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-[11px] text-ink-3 tabular-nums">{line}</span>
          {dnc && (
            <span className="shrink-0 rounded-[4px] bg-red-tint px-1 text-[9.5px] font-medium text-red">
              suppressed
            </span>
          )}
          {!dnc && a.failedPaymentCents ? (
            <span className="shrink-0 rounded-[4px] bg-amber-tint px-1 text-[9.5px] font-medium text-amber">
              unpaid
            </span>
          ) : null}
        </span>
      </span>

      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums",
          tone === "red" ? "bg-red-tint text-red" : tone === "amber" ? "bg-amber-tint text-amber" : "bg-inset text-ink-3",
        )}
      >
        {a.riskScore}
      </span>
    </button>
  );
}


