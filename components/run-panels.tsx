"use client";

import { CONNECTOR_MARKS, Glyph, PATHS } from "./icons";
import { cn, money, pct } from "@/lib/utils";
import type { Evidence, PolicyDecision, ProposedAction } from "@/lib/types";
import type { SnapshotDTO } from "@/lib/agent/loop";

/* ── the agent's reasoning, streamed ─────────────────────────────────────── */

export function ReasoningStream({ text, live }: { text: string; live: boolean }) {
  if (!text && !live) return null;
  return (
    <p className="text-[13px] leading-relaxed text-ink-2">
      {text}
      {live && (
        <span className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-accent"
          style={{ animation: "fade-in 150ms ease-out both" }} />
      )}
    </p>
  );
}

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

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col rounded-card bg-surface p-1 shadow-card">
      {items.map((e, i) => (
        <div key={e.id} className="flex items-start gap-2.5 rounded-[9px] px-2 py-2 transition-colors duration-150 hover:bg-hover-2"
          style={{ animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 45}ms both` }}>
          <span className="mt-px flex size-4 shrink-0 items-center justify-center">
            {CONNECTOR_MARKS[e.source] ?? CONNECTOR_MARKS.usage}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-ink">{e.label}</p>
            <p className="text-[12px] leading-snug text-ink-2">{e.detail}</p>
          </div>
          {e.url && (
            <a href={e.url} target="_blank" rel="noreferrer"
              className="mt-px shrink-0 text-ink-3 transition-colors duration-150 hover:text-accent-ink" aria-label="Open source record">
              <Glyph d={PATHS.arrow} size={13} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

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

export function Spark({ series }: { series: number[] }) {
  const w = 52, h = 16;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  const down = series[series.length - 1] < series[0];
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={down ? "var(--red)" : "var(--green)"} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

export function AccountCard({ a, active, onClick }: { a: AccountRow; active: boolean; onClick: () => void }) {
  const tone = a.riskScore >= 70 ? "red" : a.riskScore >= 40 ? "amber" : "green";
  const dnc = a.tags.includes("do-not-contact");
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "w-full rounded-card p-2.5 text-left transition-colors duration-150",
        active ? "bg-surface shadow-card" : "hover:bg-hover-2",
      )}>
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", tone === "red" ? "bg-red" : tone === "amber" ? "bg-amber" : "bg-green")} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{a.name}</span>
        <span className={cn("shrink-0 font-mono text-[11px] tabular-nums",
          tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : "text-ink-3")}>{a.riskScore}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">{money(a.mrrCents)}/mo</span>
        <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">{a.daysToRenewal}d</span>
        <span className={cn("font-mono text-[10.5px] tabular-nums", a.usage.changePct < 0 ? "text-red" : "text-green")}>
          {pct(a.usage.changePct)}
        </span>
        <span className="ml-auto"><Spark series={a.usage.series} /></span>
      </div>
      {(dnc || a.failedPaymentCents) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {dnc && <Tag tone="red">do-not-contact</Tag>}
          {a.failedPaymentCents ? <Tag tone="amber">payment failed</Tag> : null}
        </div>
      )}
    </button>
  );
}

function Tag({ tone, children }: { tone: "red" | "amber"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-4.5 items-center rounded-full px-1.5 font-mono text-[10px] font-medium",
      tone === "red" ? "bg-red-tint text-red" : "bg-amber-tint text-amber")}>
      {children}
    </span>
  );
}
