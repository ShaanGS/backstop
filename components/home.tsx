"use client";

import { useMemo, useState } from "react";
import { BrandMark, Glyph, PATHS } from "./icons";
import { cn, money, DATE_LOCALE } from "@/lib/utils";
import type { AccountRow } from "./run-panels";
import type { LedgerEntry, LedgerSummary } from "@/lib/ledger";

/* ─────────────────────────────────────────────────────────
 * HOME
 * What is happening across the book of business, before
 * anyone asks a question. Every number here is computed from
 * live account data or read back out of the action ledger —
 * nothing on this screen is a placeholder.
 * ───────────────────────────────────────────────────────── */

/** Risk bands. Status colours, re-stepped until the palette validator passed
 *  in both themes; each band always carries its label, never colour alone. */
const BANDS = [
  { key: "risk", label: "At risk", min: 70, color: "var(--chart-risk)" },
  { key: "watch", label: "Needs attention", min: 40, color: "var(--chart-watch)" },
  { key: "healthy", label: "Healthy", min: 0, color: "var(--chart-healthy)" },
] as const;

const bandOf = (score: number) => BANDS.find((b) => score >= b.min) ?? BANDS[2];

function Kpi({
  label, value, sub, tone = "ink",
}: { label: string; value: string; sub?: string; tone?: "ink" | "risk" | "good" }) {
  return (
    <div className="rounded-card bg-surface px-4 py-3.5 shadow-card">
      <p className="text-[11px] font-medium tracking-[0.04em] text-ink-3 uppercase">{label}</p>
      <p className={cn(
        "mt-2 text-[27px] leading-none font-semibold tracking-[-0.04em] tabular-nums",
        tone === "risk" ? "text-red" : tone === "good" ? "text-green" : "text-ink",
      )}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{sub}</p>}
    </div>
  );
}

/** Donut with a 2px surface gap between segments, per mark specs. */
function HealthDonut({ counts, total }: { counts: { key: string; label: string; n: number; color: string }[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const R = 54, SW = 13, C = 2 * Math.PI * R;
  const GAP = 2.5;

  /* Cumulative offsets without mutating across the render. */
  const arcs = counts
    .filter((c) => c.n > 0)
    .reduce<{ key: string; label: string; n: number; color: string; len: number; offset: number }[]>(
      (acc, c) => {
        const frac = c.n / total;
        const prev = acc[acc.length - 1];
        const offset = prev ? prev.offset + (prev.n / total) * C : 0;
        return [...acc, { ...c, len: Math.max(frac * C - GAP, 1), offset }];
      },
      [],
    );

  const active = counts.find((c) => c.key === hover);

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="136" height="136" viewBox="0 0 136 136" role="img" aria-label="Customer health by risk band">
          <g transform="translate(68,68) rotate(-90)">
            <circle r={R} fill="none" stroke="var(--inset)" strokeWidth={SW} />
            {arcs.map((a) => (
              <circle
                key={a.key}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === a.key ? SW + 2.5 : SW}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.offset}
                strokeLinecap="round"
                className="transition-[stroke-width] duration-150"
                onPointerEnter={() => setHover(a.key)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[23px] leading-none font-semibold tracking-[-0.04em] text-ink tabular-nums">
            {active ? active.n : total}
          </span>
          <span className="mt-1 text-[10.5px] text-ink-3">{active ? active.label : "customers"}</span>
        </div>
      </div>

      {/* Legend carries the identity, so the chart never relies on colour alone. */}
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {counts.map((c) => (
          <li
            key={c.key}
            onPointerEnter={() => setHover(c.key)}
            onPointerLeave={() => setHover(null)}
            className={cn("flex items-center gap-2 rounded-[7px] px-1.5 py-1 transition-colors",
              hover === c.key ? "bg-hover-2" : "")}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{c.label}</span>
            <span className="font-mono text-[12px] text-ink tabular-nums">{c.n}</span>
            <span className="w-9 text-right font-mono text-[11px] text-ink-3 tabular-nums">
              {total ? Math.round((c.n / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, sub, action, children }: {
  title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {sub && <p className="text-[11.5px] text-ink-3">{sub}</p>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

const NOUN: Record<string, string> = {
  create_linear_issue: "Filed a recovery task",
  create_notion_page: "Wrote the case up",
  send_customer_email: "Emailed the customer",
  post_slack_alert: "Alerted the owner",
};

function ago(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function Home({
  accounts, ledger, connectors, onInvestigate, setupHint,
}: {
  accounts: AccountRow[];
  /** Set when no connector is credentialed — the reason, in the API's words. */
  setupHint?: string | null;
  ledger: { entries: LedgerEntry[]; summary: LedgerSummary } | null;
  connectors: { id: string; name: string; role: string; configured: boolean }[];
  onInvestigate: (a: AccountRow) => void;
}) {
  const stats = useMemo(() => {
    const counts = BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      n: accounts.filter((a) => bandOf(a.riskScore).key === b.key).length,
    }));
    const atRisk = accounts.filter((a) => a.riskScore >= 70);
    const revenueAtRisk = atRisk.reduce((s, a) => s + a.mrrCents, 0);
    const uncollected = accounts.reduce((s, a) => s + (a.failedPaymentCents ?? 0), 0);
    return { counts, atRisk, revenueAtRisk, uncollected };
  }, [accounts]);

  const signals = useMemo(
    () => [...accounts].sort((a, b) => b.riskScore - a.riskScore).slice(0, 4),
    [accounts],
  );

  const s = ledger?.summary;
  /* Clock- and locale-dependent text is the classic hydration trap: the server
     renders it in the server's timezone and locale, the browser re-renders it in
     the user's, and React treats the difference as a failed hydration (#418).
     The date is pinned to one locale so both sides agree. The greeting genuinely
     cannot agree — it depends on the reader's wall clock — so it is marked as
     intentionally divergent rather than silently mismatching. */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 px-1 py-1">
      <header className="mb-1 flex items-end gap-3">
        <div>
          <h1 suppressHydrationWarning className="text-[21px] leading-tight font-semibold tracking-[-0.025em] text-ink">
            {greeting}.
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            Keel is watching {accounts.length} customer{accounts.length === 1 ? "" : "s"} across{" "}
            {connectors.filter((c) => c.configured).length} connected apps.
          </p>
        </div>
        <p className="ml-auto font-mono text-[11.5px] text-ink-3">
          {new Date().toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </header>

      {/* Someone who just cloned this has no credentials, so every figure below
          is a zero. Saying why — and where to see it populated — is the
          difference between "empty product" and "not set up yet". */}
      {setupHint && (
        <div className="rounded-card bg-surface px-4 py-3 shadow-card">
          <p className="text-[13px] font-medium text-ink">Not connected yet</p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{setupHint}</p>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-2">
            Every number below is zero because Keel has nothing to read — not because nothing is
            wrong. To see it running against real data without setting anything up, open the{" "}
            <a href="https://keel-nine-flame.vercel.app/console" target="_blank" rel="noreferrer"
              className="font-medium text-accent-ink underline underline-offset-2">hosted demo</a>.
          </p>
          <p className="mt-2 text-[12px] leading-snug text-ink-3">
            The reliability suite needs no credentials at all — <code className="font-mono text-[11.5px] text-ink-2">pnpm eval</code> runs all 18 cases on a fresh clone.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Customers" value={String(accounts.length)} sub="under watch" />
        <Kpi label="At risk" value={String(stats.atRisk.length)} tone={stats.atRisk.length ? "risk" : "ink"}
          sub={`of ${accounts.length} accounts`} />
        <Kpi label="Revenue at risk" value={money(stats.revenueAtRisk)} tone={stats.revenueAtRisk ? "risk" : "ink"}
          sub={`${money(stats.revenueAtRisk * 12)} a year`} />
        <Kpi
          label="Verified"
          value={s && s.executed ? `${s.verified}/${s.executed}` : "—"}
          tone={s && s.executed && s.verified === s.executed ? "good" : "ink"}
          sub="actions read back"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <Panel title="Customer health" sub="by computed risk score">
          <HealthDonut counts={stats.counts} total={accounts.length} />
        </Panel>

        <Panel title="Needs a look" sub="highest risk first">
          <ul className="flex flex-col gap-1">
            {signals.map((a) => {
              const band = bandOf(a.riskScore);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onInvestigate(a)}
                    className="flex w-full items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 text-left transition-colors hover:bg-hover-2"
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: band.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {a.riskReasons[0] ?? "No open risk signals"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] font-medium tabular-nums"
                      style={{ color: band.color }}>
                      {a.riskScore}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <Panel
          title="What Keel has done"
          sub={s?.total ? `${s.total} action${s.total === 1 ? "" : "s"} on the record` : undefined}
        >
          {ledger?.entries.length ? (
            <ul className="flex flex-col gap-1">
              {ledger.entries.slice(0, 4).map((e, i) => (
                <li key={`${e.runId}-${e.type}-${i}`} className="flex items-center gap-2.5 px-1.5 py-1">
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <BrandMark id={e.app} size={13} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {NOUN[e.type] ?? e.type}
                    <span className="text-ink-3"> · {e.accountName}</span>
                  </span>
                  {e.status === "blocked_by_policy" ? (
                    <span className="shrink-0 rounded-full bg-red-tint px-1.5 text-[10px] font-medium text-red">
                      refused
                    </span>
                  ) : e.verified ? (
                    <span className="shrink-0 text-green"><Glyph d={PATHS.check} size={11} strokeWidth={3} /></span>
                  ) : null}
                  <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{ago(e.ts)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1.5 py-2 text-[12px] leading-snug text-ink-3">
              Nothing yet. Ask the agent to run a save play and every action it takes — or refuses
              to take — lands here.
            </p>
          )}
        </Panel>

        <Panel title="Connected apps" sub={`${connectors.filter((c) => c.configured).length} of ${connectors.length}`}>
          <ul className="grid grid-cols-2 gap-1">
            {connectors.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-[8px] px-1.5 py-1.5">
                <span className={cn("flex size-4 shrink-0 items-center justify-center", !c.configured && "opacity-35 grayscale")}>
                  <BrandMark id={c.id} size={14} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[12px]", c.configured ? "text-ink" : "text-ink-3")}>
                  {c.name}
                </span>
                <span className={cn("size-1.5 shrink-0 rounded-full", c.configured ? "bg-green" : "bg-line-strong")} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
