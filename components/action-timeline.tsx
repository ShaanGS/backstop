"use client";

import { useState } from "react";
import { CONNECTOR_MARKS, Glyph, PATHS } from "./icons";
import { cn } from "@/lib/utils";
import type { ExecutedAction, ProposedAction } from "@/lib/types";

/* The execution timeline. Each row is one proposed action moving through the
 * pipeline: pending → running → (executed | skipped | blocked | failed), with
 * the verification receipt tucked into the expandable detail. */

export type RowState = {
  action: ProposedAction;
  status: "pending" | "running" | ExecutedAction["status"];
  result?: ExecutedAction;
};

const ACTION_APP: Record<ProposedAction["type"], string> = {
  create_linear_issue: "linear",
  create_notion_page: "notion",
  send_customer_email: "resend",
  post_slack_alert: "slack",
};

function Ring({ active, n }: { active: boolean; n: number }) {
  const size = 22, stroke = 2, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-[22px] shrink-0 items-center justify-center">
      <svg width={size} height={size} className="absolute inset-0" style={active ? { animation: "spin 1.1s linear infinite" } : undefined}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${c * 0.3} ${c * 0.7}`} />
        )}
      </svg>
      <span className="relative text-[10px] font-semibold tabular-nums text-ink-3">{n}</span>
    </span>
  );
}

function Badge({ tone, icon }: { tone: "green" | "red" | "amber" | "ink"; icon: string }) {
  const bg = { green: "bg-green", red: "bg-red", amber: "bg-amber", ink: "bg-ink-3" }[tone];
  return (
    <span className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-full text-white", bg)}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <Glyph d={icon} size={12} strokeWidth={3} />
    </span>
  );
}

const PILL: Record<string, { label: string; cls: string }> = {
  executed: { label: "Verified", cls: "bg-green-tint text-green" },
  skipped_idempotent: { label: "Skipped", cls: "bg-inset text-ink-2" },
  blocked_by_policy: { label: "Blocked", cls: "bg-red-tint text-red" },
  failed: { label: "Failed", cls: "bg-red-tint text-red" },
  running: { label: "Running", cls: "bg-accent-tint text-accent-ink" },
};

export default function ActionTimeline({ rows }: { rows: RowState[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!rows.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const isOpen = open[i] ?? false;
        const v = row.result?.verification;
        const pill = PILL[row.status];

        const badge =
          row.status === "pending" ? <Ring active={false} n={i + 1} />
          : row.status === "running" ? <Ring active n={i + 1} />
          : row.status === "executed" ? <Badge tone="green" icon={PATHS.check} />
          : row.status === "blocked_by_policy" ? <Badge tone="red" icon={PATHS.lock} />
          : row.status === "failed" ? <Badge tone="red" icon={PATHS.x} />
          : <Badge tone="ink" icon={PATHS.retry} />;

        return (
          <div key={i} className="overflow-hidden bg-surface shadow-card transition-[border-radius] duration-300"
            style={{ borderRadius: isOpen ? 14 : 20, animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 60}ms both` }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
              className="flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-hover-2">
              {badge}
              <span className="flex size-5 shrink-0 items-center justify-center">
                {CONNECTOR_MARKS[ACTION_APP[row.action.type]]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{row.action.summary}</span>
              {row.result?.attempts && row.result.attempts > 1 ? (
                <span className="shrink-0 font-mono text-[10.5px] text-amber">retry ×{row.result.attempts - 1}</span>
              ) : null}
              {row.result?.durationMs ? (
                <span className="shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">{(row.result.durationMs / 1000).toFixed(1)}s</span>
              ) : null}
              {pill && (
                <span className={cn("inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium", pill.cls)}
                  style={{ animation: "fade-in 200ms ease-out both" }}>
                  {pill.label}
                </span>
              )}
              <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-ink-3">
                <Glyph d={PATHS.chevron} size={14} strokeWidth={2.2} />
              </span>
            </button>

            <div className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}>
              <div className="overflow-hidden">
                <div className="grid grid-cols-[22px_1fr] gap-2.5 px-2.5 pb-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex flex-col gap-1.5 text-[12px]">
                    {row.result?.reason && (
                      <Line label={row.status === "blocked_by_policy" ? "Policy" : "Detail"} value={row.result.reason} />
                    )}
                    {row.result?.externalId && (
                      <Line label="External id" value={row.result.externalId} mono
                        href={row.result.externalUrl} />
                    )}
                    <Line label="Idempotency key" value={row.result?.idempotencyKey ?? "—"} mono />
                    {v && (
                      <div className="mt-0.5 flex items-start gap-2 rounded-[8px] bg-inset p-2">
                        <span className={cn("mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-white", v.verified ? "bg-green" : "bg-red")}>
                          <Glyph d={v.verified ? PATHS.check : PATHS.x} size={9} strokeWidth={3.5} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-medium text-ink">
                            {v.verified ? "Verified by read-back" : "Verification failed"}
                          </p>
                          <p className="text-[11.5px] text-ink-2">{v.detail}</p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">{v.method}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Line({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-ink-3">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer"
          className={cn("animated-underline min-w-0 truncate text-right text-accent-ink", mono && "font-mono text-[11px]")}>
          {value}
        </a>
      ) : (
        <span className={cn("min-w-0 truncate text-right text-ink-2", mono && "font-mono text-[11px]")}>{value}</span>
      )}
    </div>
  );
}
