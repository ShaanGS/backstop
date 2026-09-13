"use client";

import { useMemo } from "react";
import { BrandMark, Glyph, PATHS } from "./icons";
import { cn } from "@/lib/utils";
import type { LedgerEntry, LedgerSummary } from "@/lib/ledger";

/* ─────────────────────────────────────────────────────────
 * THE LEDGER
 * A conversation is forgotten when the tab closes; a system
 * trusted with irreversible actions cannot be. Every row here
 * was reconstructed from the append-only audit trail on disk,
 * so this view survives a refresh, a restart, and the operator
 * who ran it leaving the company.
 *
 * Refusals and duplicate-suppressions are rows too. An action
 * Keel declined to take is a thing it did.
 * ───────────────────────────────────────────────────────── */

const NOUN: Record<string, string> = {
  create_linear_issue: "Recovery task",
  create_notion_page: "Save plan",
  send_customer_email: "Customer email",
  post_slack_alert: "Owner alert",
};

function Stat({
  n, label, sub, tone = "ink",
}: { n: number | string; label: string; sub?: string; tone?: "ink" | "green" | "red" | "amber" }) {
  const color =
    tone === "green" ? "text-green" : tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : "text-ink";
  return (
    <div className="rounded-card bg-surface px-3.5 py-3 shadow-card">
      <p className={cn("font-mono text-[22px] leading-none font-medium tabular-nums", color)}>{n}</p>
      <p className="mt-1.5 text-[11px] font-medium tracking-[0.04em] text-ink-2 uppercase">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{sub}</p>}
    </div>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today.getTime() - 86_400_000).toDateString() === d.toDateString();
  if (sameDay) return "Today";
  if (yest) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Row({ e }: { e: LedgerEntry }) {
  const ok = e.status === "executed";
  const As = e.externalUrl ? "a" : "div";
  const pill = ok
    ? e.verified
      ? { text: "Verified", cls: "bg-green-tint text-green", icon: PATHS.check }
      : { text: "Unverified", cls: "bg-amber-tint text-amber", icon: PATHS.alert }
    : e.status === "blocked_by_policy"
      ? { text: "Refused", cls: "bg-red-tint text-red", icon: PATHS.lock }
      : e.status === "failed"
        ? { text: "Failed", cls: "bg-red-tint text-red", icon: PATHS.alert }
        : { text: "Duplicate", cls: "bg-inset text-ink-2", icon: PATHS.retry };

  return (
    <As
      {...(e.externalUrl ? { href: e.externalUrl, target: "_blank", rel: "noreferrer" } : {})}
      className={cn(
        "group grid grid-cols-[44px_18px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-line px-3.5 py-2.5 last:border-0 sm:grid-cols-[52px_18px_132px_minmax(0,1fr)_auto]",
        e.externalUrl && "transition-colors duration-150 hover:bg-hover-2",
      )}
    >
      <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
        {new Date(e.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="flex size-[18px] items-center justify-center">
        <BrandMark id={e.app} size={13} />
      </span>
      <span className="hidden truncate text-[12px] font-medium text-ink sm:block">{e.accountName}</span>
      <span className="min-w-0">
        <span className="truncate text-[12px] text-ink">
          <span className="sm:hidden">{e.accountName} · </span>
          {NOUN[e.type] ?? e.type}
        </span>
        <span className="block truncate text-[11px] text-ink-3">{e.reason ?? e.summary}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {e.idempotencyKey && (
          <span
            title={`Idempotency key ${e.idempotencyKey}`}
            className="hidden font-mono text-[10px] text-ink-3 lg:inline"
          >
            {e.idempotencyKey.slice(0, 8)}
          </span>
        )}
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium", pill.cls)}>
          <Glyph d={pill.icon} size={9} strokeWidth={3} />
          {pill.text}
        </span>
        {e.externalUrl && (
          <span className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
            <Glyph d={PATHS.arrow} size={12} />
          </span>
        )}
      </span>
    </As>
  );
}

export default function Ledger({
  entries, summary, evals,
}: {
  entries: LedgerEntry[];
  summary: LedgerSummary;
  evals: { passed: number; total: number; mustNot: number };
}) {
  const days = useMemo(() => {
    const m = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const k = dayLabel(e.ts);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [entries]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-5" style={{ animation: "fade-in 220ms both" }}>
      <header className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">Everything Keel has done</h2>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
          Rebuilt from the append-only audit trail on disk, not from this session. Actions it
          refused to take are rows too.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat n={summary.executed} label="Actions taken" sub={`across ${summary.runs} run${summary.runs === 1 ? "" : "s"}`} />
        <Stat
          n={summary.executed ? `${summary.verified}/${summary.executed}` : "—"}
          label="Read back"
          sub="re-fetched from the app"
          tone={summary.executed && summary.verified === summary.executed ? "green" : "ink"}
        />
        <Stat n={summary.blocked} label="Refused" sub="stopped by policy" tone={summary.blocked ? "red" : "ink"} />
        <Stat n={summary.skipped} label="Duplicates" sub="suppressed by ledger" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card bg-inset px-3 py-2 text-[11.5px] text-ink-2">
        <span className="text-green"><Glyph d={PATHS.check} size={11} strokeWidth={3} /></span>
        <span className="font-medium text-ink">
          {evals.passed}/{evals.total} reliability cases
        </span>
        <span className="text-ink-3">·</span>
        <span>{evals.mustNot} of them assert Keel does <em className="not-italic text-ink">nothing</em></span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-3">pnpm eval</span>
      </div>

      {entries.length === 0 ? (
        <div className="mt-3 rounded-card bg-surface px-4 py-8 text-center shadow-card">
          <p className="text-[13px] font-medium text-ink">Nothing on the record yet</p>
          <p className="mx-auto mt-1 max-w-[340px] text-[12px] leading-snug text-ink-2">
            Every action, refusal and suppressed duplicate lands here the moment a save play
            runs — with the external record it created and whether Keel read it back.
          </p>
        </div>
      ) : (
        days.map(([day, rows]) => (
          <section key={day} className="mt-3">
            <p className="mb-1.5 px-1 text-[11px] font-medium tracking-[0.04em] text-ink-3 uppercase">{day}</p>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {rows.map((e, i) => (
                <Row key={`${e.runId}-${e.type}-${i}`} e={e} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
