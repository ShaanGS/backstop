"use client";

import { useMemo, useRef, useState } from "react";
import { CONNECTOR_MARKS, Glyph, PATHS } from "./icons";
import { cn, money } from "@/lib/utils";
import type { Evidence, ExecutedAction } from "@/lib/types";
import type { SnapshotDTO } from "@/lib/agent/loop";

/* ─────────────────────────────────────────────────────────
 * CASE FILE
 * What the agent found, as something you read in two seconds
 * rather than a paragraph you have to parse. A KPI row of
 * hero numbers, a risk meter, and the usage series that is
 * the actual story — with the baseline it fell away from.
 * ───────────────────────────────────────────────────────── */

/* ── risk meter ───────────────────────────────────────────────────────── */

function band(score: number) {
  if (score >= 70) return { label: "Critical", tone: "var(--red)", cls: "text-red" };
  if (score >= 40) return { label: "Elevated", tone: "var(--amber)", cls: "text-amber" };
  return { label: "Healthy", tone: "var(--green)", cls: "text-green" };
}

export function RiskMeter({ score, reasons }: { score: number; reasons: string[] }) {
  const b = band(score);
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] leading-none font-semibold tracking-[-0.04em] text-ink tabular-nums">
          {score}
        </span>
        <span className="font-mono text-[12px] text-ink-3">/100</span>
        <span className={cn("ml-1 inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
          score >= 70 ? "bg-red-tint text-red" : score >= 40 ? "bg-amber-tint text-amber" : "bg-green-tint text-green")}>
          <Glyph d={score >= 70 ? PATHS.alert : PATHS.check} size={10} strokeWidth={2.6} />
          {b.label}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-inset" role="meter"
        aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Churn risk score">
        <div className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${score}%`, background: b.tone, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {reasons.map((r) => (
            <li key={r} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
              <span className="size-1 rounded-full" style={{ background: b.tone }} />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── stat tile ────────────────────────────────────────────────────────── */

export function StatTile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "red" | "amber" | "green";
}) {
  return (
    <div className="min-w-0 rounded-[10px] bg-inset px-3 py-2.5">
      <p className="text-[10px] font-semibold tracking-[0.05em] text-ink-3 uppercase">{label}</p>
      <p className={cn("mt-1 text-[21px] leading-none font-semibold tracking-[-0.03em] tabular-nums",
        tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : tone === "green" ? "text-green" : "text-ink")}>
        {value}
      </p>
      {sub && <p className="mt-1 truncate text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
}

/* ── usage chart ──────────────────────────────────────────────────────── */

const W = 640, H = 140, PAD = { t: 14, r: 74, b: 20, l: 8 };

export function UsageChart({ series, baseline }: { series: number[]; baseline: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { pts, path, area, yBase } = useMemo(() => {
    const lo = Math.min(...series, baseline), hi = Math.max(...series, baseline);
    const pad = (hi - lo) * 0.18 || 1;
    const min = lo - pad, max = hi + pad;
    const x = (i: number) => PAD.l + (i / (series.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
    const pts = series.map((v, i) => ({ x: x(i), y: y(v), v, i }));
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${path} L${pts[pts.length - 1].x.toFixed(1)} ${H - PAD.b} L${pts[0].x.toFixed(1)} ${H - PAD.b} Z`;
    return { pts, path, area, yBase: y(baseline), min, max };
  }, [series, baseline]);

  const last = pts[pts.length - 1];
  const active = hover === null ? null : pts[hover];
  const down = series[series.length - 1] < baseline;
  const tone = down ? "var(--red)" : "var(--green)";

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    for (const p of pts) { const d = Math.abs(p.x - vx); if (d < bd) { bd = d; best = p.i; } }
    setHover(best);
  }

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline gap-2">
        <span className="text-[11.5px] font-medium text-ink">Weekly active seats</span>
        <span className="font-mono text-[10.5px] text-ink-3">trailing 8 weeks</span>
      </figcaption>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" className="block touch-none select-none"
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`Weekly active seats fell from a baseline of ${baseline} to ${series[series.length - 1]} over eight weeks.`}>
        <defs>
          <linearGradient id="ug" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.20" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline reference — recessive, dashed, directly labelled */}
        <line x1={PAD.l} y1={yBase} x2={W - PAD.r} y2={yBase}
          stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={W - PAD.r + 5} y={yBase + 3} className="fill-[var(--ink-3)]"
          style={{ fontSize: 9.5, fontFamily: "var(--font-mono)" }}>
          base {baseline}
        </text>

        <path d={area} fill="url(#ug)" />
        <path d={path} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* the final value is the point of the chart, so it is the one labelled */}
        <circle cx={last.x} cy={last.y} r="4" fill={tone} stroke="var(--surface)" strokeWidth="2" />
        <text x={last.x + 8} y={last.y + 3.5} style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}
          className="fill-[var(--ink)]">
          {last.v}
        </text>

        {active && (
          <g pointerEvents="none">
            <line x1={active.x} y1={PAD.t - 6} x2={active.x} y2={H - PAD.b} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={active.x} cy={active.y} r="4.5" fill="var(--surface)" stroke={tone} strokeWidth="2" />
          </g>
        )}

        {pts.map((p) => (
          <text key={p.i} x={p.x} y={H - 6} textAnchor="middle"
            className={cn(active?.i === p.i ? "fill-[var(--ink-2)]" : "fill-[var(--ink-3)]")}
            style={{ fontSize: 9, fontFamily: "var(--font-mono)" }}>
            w{p.i + 1}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex h-4 items-center">
        {active ? (
          <p className="font-mono text-[11px] text-ink-2 tabular-nums">
            week {active.i + 1} · <span className="text-ink">{active.v} seats</span>
            <span className={cn("ml-2", active.v < baseline ? "text-red" : "text-green")}>
              {active.v < baseline ? "" : "+"}{Math.round(((active.v - baseline) / baseline) * 1000) / 10}% vs base
            </span>
          </p>
        ) : (
          <p className="text-[11px] text-ink-3">Hover the line for weekly detail.</p>
        )}
      </div>
    </figure>
  );
}

/* ── evidence, grouped by the app it came from ────────────────────────── */

const SOURCE_NAME: Record<string, string> = {
  stripe: "Stripe", linear: "Linear", usage: "Telemetry", notion: "Notion", resend: "Resend", slack: "Slack",
};

export function EvidenceGroups({ items }: { items: Evidence[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, Evidence[]>();
    for (const e of items) m.set(e.source, [...(m.get(e.source) ?? []), e]);
    return [...m.entries()];
  }, [items]);

  if (!groups.length) return null;
  return (
    <div className="grid items-start gap-2 sm:grid-cols-2">
      {groups.map(([source, list], gi) => (
        <div key={source} className="rounded-[10px] bg-inset p-2"
          style={{ animation: `fade-up 340ms cubic-bezier(0.23,1,0.32,1) ${gi * 70}ms both` }}>
          <div className="flex items-center gap-1.5 px-1 pb-1.5">
            <span className="flex size-3.5 items-center justify-center [&_svg]:size-3.5">
              {CONNECTOR_MARKS[source] ?? CONNECTOR_MARKS.usage}
            </span>
            <span className="text-[11px] font-medium text-ink">{SOURCE_NAME[source] ?? source}</span>
            <span className="font-mono text-[10px] text-ink-3">{list.length}</span>
          </div>
          <div className="flex flex-col gap-1">
            {list.map((e) => {
              const Row = e.url ? "a" : "div";
              return (
                <Row key={e.key} {...(e.url ? { href: e.url, target: "_blank", rel: "noreferrer" } : {})}
                  className={cn("group flex items-start gap-1.5 rounded-[7px] bg-surface px-2 py-1.5 shadow-hairline transition-colors duration-150",
                    e.url && "hover:bg-hover-2")}>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[11.5px] font-medium text-ink", e.url && "animated-underline")}>{e.label}</span>
                    <span className="block text-[11.5px] leading-snug text-ink-2">{e.detail}</span>
                  </span>
                  {e.url && (
                    <span className="mt-0.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
                      <Glyph d={PATHS.arrow} size={11} />
                    </span>
                  )}
                </Row>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── the whole case file ──────────────────────────────────────────────── */

export default function CaseFile({ s }: { s: SnapshotDTO }) {
  const usageTone = s.usage.changePct <= -30 ? "red" : s.usage.changePct < 0 ? "amber" : "green";
  const renewTone = s.daysToRenewal <= 14 ? "red" : s.daysToRenewal <= 30 ? "amber" : undefined;
  const open = s.tickets.filter((t) => t.state !== "Done");

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card"
      style={{ animation: "fade-up 460ms cubic-bezier(0.23,1,0.32,1) both" }}>
      {/* header */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{s.name}</h3>
            {s.tags.map((t) => (
              <span key={t} className={cn("inline-flex h-4.5 items-center rounded-full px-1.5 font-mono text-[9.5px] font-medium",
                t === "do-not-contact" || t === "legal-hold" ? "bg-red-tint text-red" : "bg-inset text-ink-2")}>
                {t}
              </span>
            ))}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
            {s.domain} <span className="text-line-strong">·</span> owner {s.owner}{" "}
            <span className="text-line-strong">·</span> {s.contact}
          </p>
        </div>
        <div className="w-full sm:w-[260px]">
          <RiskMeter score={s.riskScore} reasons={s.riskReasons} />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 p-4 pb-3 sm:grid-cols-5">
        <StatTile label="Revenue" value={`${money(s.mrrCents)}`} sub={`per month`} />
        <StatTile label="Renewal" value={`${s.daysToRenewal}d`} sub={s.status} tone={renewTone} />
        <StatTile label="Seats" value={`${s.usage.changePct > 0 ? "+" : ""}${s.usage.changePct}%`}
          sub={`${s.usage.current} of ${s.usage.baseline}`} tone={usageTone} />
        <StatTile label="At risk"
          value={s.failedPaymentCents ? money(s.failedPaymentCents) : "—"}
          sub={s.failedPaymentCents ? "payment failed" : "billing clean"}
          tone={s.failedPaymentCents ? "red" : undefined} />
        <StatTile label="Tickets" value={String(open.length)}
          sub={open.some((t) => t.labels.some((l) => l.toLowerCase() === "escalation")) ? "incl. escalation" : open.length ? "unresolved" : "none"}
          tone={open.some((t) => t.labels.some((l) => l.toLowerCase() === "escalation")) ? "red" : open.length >= 2 ? "amber" : undefined} />
      </div>

      {/* the story */}
      <div className="px-4 pb-3">
        <UsageChart series={s.usage.series} baseline={s.usage.baseline} />
      </div>

      <div className="border-t border-line bg-canvas/40 p-3">
        <p className="mb-2 px-0.5 text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Evidence · {s.evidence.length} facts from {new Set(s.evidence.map((e) => e.source)).size} sources
        </p>
        <EvidenceGroups items={s.evidence} />
      </div>
    </div>
  );
}

/* ── receipts ─────────────────────────────────────────────────────────── */


const ACTION_APP: Record<string, string> = {
  create_linear_issue: "linear",
  create_notion_page: "notion",
  send_customer_email: "resend",
  post_slack_alert: "slack",
};

const ACTION_NOUN: Record<string, string> = {
  create_linear_issue: "Recovery task",
  create_notion_page: "Save plan",
  send_customer_email: "Customer email",
  post_slack_alert: "Owner alert",
};

/**
 * What the run actually produced, with links to the real records. The point of
 * the whole system is that this list is checkable, so it is shown rather than
 * tucked behind a disclosure.
 */
export function Receipts({ actions, seconds }: { actions: ExecutedAction[]; seconds: number }) {
  const executed = actions.filter((a) => a.status === "executed");
  const skipped = actions.filter((a) => a.status === "skipped_idempotent");
  const blocked = actions.filter((a) => a.status === "blocked_by_policy");
  const failed = actions.filter((a) => a.status === "failed");
  const verified = executed.filter((a) => a.verification?.verified).length;

  const headline =
    blocked.length && !executed.length ? { n: blocked.length, label: "blocked by policy — nothing was sent", cls: "text-red", icon: PATHS.lock }
    : skipped.length && !executed.length ? { n: skipped.length, label: "skipped — already done, nothing duplicated", cls: "text-ink-2", icon: PATHS.retry }
    : { n: executed.length, label: `executed · ${verified} verified by read-back`, cls: "text-green", icon: PATHS.check };

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card"
      style={{ animation: "pop-in 320ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full",
          headline.cls === "text-green" ? "bg-green-tint" : headline.cls === "text-red" ? "bg-red-tint" : "bg-inset", headline.cls)}>
          <Glyph d={headline.icon} size={12} strokeWidth={2.8} />
        </span>
        <span className={cn("text-[19px] leading-none font-semibold tracking-[-0.02em] tabular-nums", headline.cls)}>{headline.n}</span>
        <span className="text-[12.5px] text-ink-2">{headline.label}</span>
        {failed.length > 0 && (
          <span className="ml-1 inline-flex h-5 items-center rounded-full bg-red-tint px-2 text-[11px] font-medium text-red">
            {failed.length} failed
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">{seconds.toFixed(1)}s</span>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-col border-t border-line">
          {actions.map((a, i) => {
            const app = ACTION_APP[a.type] ?? "usage";
            const ok = a.status === "executed";
            const Row = a.externalUrl ? "a" : "div";
            return (
              <Row key={i} {...(a.externalUrl ? { href: a.externalUrl, target: "_blank", rel: "noreferrer" } : {})}
                className={cn("group flex items-center gap-2.5 border-b border-line px-3.5 py-2 last:border-0 transition-colors duration-150",
                  a.externalUrl && "hover:bg-hover-2")}
                style={{ animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 70}ms both` }}>
                <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
                  {CONNECTOR_MARKS[app] ?? CONNECTOR_MARKS.usage}
                </span>
                <span className="shrink-0 text-[12px] font-medium text-ink">{ACTION_NOUN[a.type] ?? a.type}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2"
                  title={a.verification ? `${a.verification.method} — ${a.verification.detail}` : undefined}>
                  {a.status === "executed" && a.verification?.detail ? a.verification.detail : (a.reason ?? a.summary)}
                </span>
                {a.externalId && (
                  <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 sm:inline">
                    {a.externalId.length > 22 ? `${a.externalId.slice(0, 10)}…` : a.externalId}
                  </span>
                )}
                {ok ? (
                  <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium",
                    a.verification?.verified ? "bg-green-tint text-green" : "bg-amber-tint text-amber")}>
                    <Glyph d={a.verification?.verified ? PATHS.check : PATHS.alert} size={9} strokeWidth={3} />
                    {a.verification?.verified ? "Verified" : "Unverified"}
                  </span>
                ) : (
                  <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10.5px] font-medium",
                    a.status === "blocked_by_policy" ? "bg-red-tint text-red" : a.status === "failed" ? "bg-red-tint text-red" : "bg-inset text-ink-2")}>
                    {a.status === "blocked_by_policy" ? "Blocked" : a.status === "failed" ? "Failed" : "Skipped"}
                  </span>
                )}
                {a.externalUrl && (
                  <span className="shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <Glyph d={PATHS.arrow} size={12} />
                  </span>
                )}
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
