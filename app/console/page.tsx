"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionTimeline, { type RowState } from "@/components/action-timeline";
import AgentProse from "@/components/agent-prose";
import Composer, { type MentionAccount } from "@/components/composer";
import { AccountCard, ApprovalGate, PolicyPanel, type AccountRow } from "@/components/run-panels";
import CaseFile, { Receipts } from "@/components/case-file";
import Ledger from "@/components/ledger";
import Home from "@/components/home";
import type { LedgerEntry, LedgerSummary, MetricsSummary } from "@/lib/ledger";
import { formatMs, formatTokens, type RunMetrics } from "@/lib/telemetry";
import { applyTheme } from "@/lib/theme";
import { AccountSkeleton, ConnectorRow } from "@/components/states";
import { ToolCard, ToolLog } from "@/components/agents/tool-card";
import LoadingState from "@/components/loading-state";
import { Glyph, PATHS } from "@/components/icons";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";
import type { AgentEvent, SnapshotDTO } from "@/lib/agent/loop";
import type { PolicyDecision, Plan, ProposedAction } from "@/lib/types";

type Phase = "investigating" | "awaiting" | "executing" | "done" | "error";
type Connector = { id: string; name: string; role: string; direction: string; configured: boolean; whenMissing?: string };

type Turn = {
  id: string;
  instruction: string;
  phase: Phase;
  reasoning: string;
  tools: { id: string; name: string; summary?: string; details?: string[] }[];
  plan: Plan | null;
  snapshot: SnapshotDTO | null;
  evidence: SnapshotDTO["evidence"];
  decisions: PolicyDecision[];
  gate: { planId: string; rule: string; reason: string; actions: ProposedAction[] } | null;
  rows: RowState[];
  tally: { executed: number; skipped: number; blocked: number; failed: number } | null;
  metrics: RunMetrics | null;
  error: string | null;
  startedAt: number;
  ms: number;
};

const newTurn = (instruction: string): Turn => ({
  id: `t_${Date.now().toString(36)}`,
  instruction, phase: "investigating", reasoning: "", tools: [], plan: null, snapshot: null, metrics: null,
  evidence: [], decisions: [], gate: null, rows: [], tally: null, error: null, startedAt: Date.now(), ms: 0,
});

export default function Console() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [modelReady, setModelReady] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const current = turns[turns.length - 1];
  const busy = current?.phase === "investigating" || current?.phase === "executing";

  /* ── boot ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    try { setTheme((localStorage.getItem("keel-theme") as "light" | "dark") ?? null); } catch {}
    fetch("/api/connectors").then((r) => r.json()).then((d) => {
      setConnectors(d.connectors); setModelReady(d.modelReady);
    }).catch(() => {});
  }, []);

  /* A run changes an account's state, so the list is re-read when one finishes.
     That read goes to Stripe and Linear live and takes several seconds, and it
     used to reset `ready` to null first — which replaced the whole sidebar with
     skeletons every time, losing the operator's place to refetch data that was
     still perfectly readable. Keep showing what we have and swap it when the
     new data lands; `ready` is already null on first load, so the skeletons
     still appear exactly once, when there is genuinely nothing to show. */
  const loadAccounts = useCallback((fresh = false) => {
    setRefreshing(true);
    fetch(`/api/accounts${fresh ? "?fresh=1" : ""}`).then((r) => r.json()).then((d) => {
      setAccounts(d.accounts ?? []); setReady(Boolean(d.ready)); setHint(d.reason ?? null);
    }).catch((e) => { setReady(false); setHint(e.message); })
      .finally(() => setRefreshing(false));
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  function toggleTheme() {
    const next = (theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  /* ── live timer on the running turn ───────────────────────────────── */

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      setTurns((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, ms: Date.now() - x.startedAt } : x)));
    }, 100);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, current?.reasoning, current?.rows, current?.tally]);

  /* ── event application ────────────────────────────────────────────── */

  const patch = (fn: (t: Turn) => Turn) =>
    setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? fn(t) : t)));

  function applyEvent(e: AgentEvent) {
    switch (e.type) {
      case "run_started": patch((t) => ({ ...t, phase: "investigating" })); break;
      case "thinking_delta": patch((t) => ({ ...t, reasoning: t.reasoning + e.text })); break;
      case "evidence": patch((t) => ({ ...t, evidence: [...t.evidence, ...e.items] })); break;
      case "tool_call": patch((t) => ({ ...t, tools: [...t.tools, { id: e.id, name: e.name }] })); break;
      case "tool_result":
        patch((t) => ({ ...t, tools: t.tools.map((c) => (c.id === e.id ? { ...c, summary: e.summary, details: e.details } : c)) })); break;
      case "plan":
        patch((t) => ({ ...t, plan: e.plan, snapshot: e.snapshot, rows: e.plan.actions.map((action) => ({ action, status: "pending" as const })) })); break;
      case "policy": patch((t) => ({ ...t, decisions: e.decisions })); break;
      case "awaiting_approval":
        patch((t) => ({ ...t, phase: "awaiting", gate: { planId: e.planId, rule: e.rule, reason: e.reason, actions: e.actions } })); break;
      case "action_started":
        patch((t) => ({ ...t, phase: "executing", rows: t.rows.map((r, i) => (i === e.index ? { ...r, status: "running" } : r)) })); break;
      case "action_result":
        patch((t) => ({ ...t, rows: t.rows.map((r, i) => (i === e.index ? { ...r, status: e.result.status, result: e.result } : r)) })); break;
      case "run_finished":
        patch((t) => ({ ...t, phase: "done", gate: null, tally: { executed: e.executed, skipped: e.skipped, blocked: e.blocked, failed: e.failed } })); break;
      case "metrics": patch((t) => ({ ...t, metrics: e.metrics })); break;
      case "error": patch((t) => ({ ...t, phase: "error", error: e.message })); break;
    }
  }

  async function consume(res: Response) {
    if (!res.body) throw new Error("No response stream.");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) applyEvent(JSON.parse(l) as AgentEvent);
    }
  }

  async function ask(instruction: string, accountId?: string) {
    setTurns((ts) => [...ts, newTurn(instruction)]);
    try {
      await consume(await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, accountId }),
      }));
    } catch (e) {
      patch((t) => ({ ...t, phase: "error", error: (e as Error).message }));
    }
    if (turnsRef.current[turnsRef.current.length - 1]?.phase !== "awaiting") loadAccounts(true);
  }

  async function decide(approved: boolean) {
    const gate = current?.gate;
    if (!gate) return;
    patch((t) => ({ ...t, phase: "executing", startedAt: Date.now() }));
    try {
      await consume(await fetch("/api/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: gate.planId, approved }),
      }));
      loadAccounts(true);
    } catch (e) {
      patch((t) => ({ ...t, phase: "error", error: (e as Error).message }));
    }
  }

  /** Re-executes an identical plan. Every action should come back skipped. */
  async function replay(planId: string, label: string) {
    setTurns((ts) => [...ts, { ...newTurn(`Replay the same plan for ${label}`), phase: "executing" as Phase }]);
    try {
      await consume(await fetch("/api/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, approved: true }),
      }));
    } catch (e) {
      patch((t) => ({ ...t, phase: "error", error: (e as Error).message }));
    }
  }

  const mentions: MentionAccount[] = accounts.map((a) => ({
    id: a.id, name: a.name, mrrCents: a.mrrCents, riskScore: a.riskScore, tags: a.tags,
  }));

  /* ── the ledger — what Keel has done, read back from disk ─────────── */

  const [view, setView] = useState<"home" | "agent" | "ledger">("home");
  const [ledger, setLedger] = useState<{
    entries: LedgerEntry[];
    summary: LedgerSummary;
    metrics: MetricsSummary | null;
    evals: { passed: number; total: number; mustNot: number } | null;
    ephemeral?: boolean;
  } | null>(null);

  const loadLedger = useCallback(async () => {
    try {
      const r = await fetch("/api/ledger", { cache: "no-store" });
      if (r.ok) setLedger(await r.json());
    } catch { /* the console still works without it */ }
  }, []);

  useEffect(() => { if (view !== "agent") void loadLedger(); }, [view, loadLedger]);
  /* Re-read once a run settles: the ledger is written by the server mid-run. */
  useEffect(() => { if (!busy) void loadLedger(); }, [busy, loadLedger]);

  /* ── render ───────────────────────────────────────────────────────── */

  return (
    <div className="grid h-dvh grid-cols-1 lg:grid-cols-[296px_minmax(0,1fr)]">
      {/* rail */}
      <aside className="hidden min-h-0 flex-col border-r border-line bg-canvas lg:flex">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <Wordmark />
          <button onClick={toggleTheme} aria-label="Toggle theme" data-press
            className="ml-auto flex size-6 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink">
            <Glyph size={13}>
              <circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
            </Glyph>
          </button>
        </div>

        <div className="px-3 pb-3">
          <p className="px-1.5 pb-1 text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Apps Keel can reach</p>
          {connectors.map((c) => <ConnectorRow key={c.id} c={c} />)}
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3">
          <div className="flex items-center px-1.5 pb-1">
            <p className="text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Your customers</p>
            <button onClick={() => loadAccounts(true)} disabled={busy || refreshing}
              aria-label="Refresh accounts" aria-busy={refreshing} data-press
              className="ml-auto flex size-5 items-center justify-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:opacity-40">
              <span className={refreshing ? "animate-[spin_900ms_linear_infinite]" : undefined}>
                <Glyph d={PATHS.retry} size={11} />
              </span>
            </button>
          </div>
          <div className="scroll-slim -mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-3">
            {ready === null && [0, 1, 2, 3, 4].map((i) => <AccountSkeleton key={i} i={i} />)}
            {ready === false && (
              <p className="rounded-card bg-surface p-2.5 text-[11.5px] leading-snug text-ink-2 shadow-card">{hint}</p>
            )}
            {accounts.map((a) => (
              <AccountCard key={a.id} a={a} active={current?.snapshot?.accountId === a.id}
                onClick={() => !busy && ask(`Investigate @${a.name} and run the save play if the evidence warrants it.`, a.id)} />
            ))}
          </div>
        </div>

        <a href="https://github.com/ShaanGS/keel" target="_blank" rel="noreferrer"
          className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-[11.5px] text-ink-3 transition-colors hover:text-ink">
          <Glyph d={PATHS.doc} size={12} />
          <span className="animated-underline">18/18 reliability cases</span>
          <span className="ml-auto text-green">✓</span>
        </a>
      </aside>

      {/* main */}
      <main className="flex min-h-0 flex-col bg-canvas">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Revenue retention agent</h1>
            <p className="text-[11.5px] text-ink-3">Finds the customer about to leave, acts, and proves what it did</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {view === "agent" && current && busy && (
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">{(current.ms / 1000).toFixed(1)}s</span>
            )}
            {view === "agent" && current && <StatusPill phase={current.phase} />}
            <div role="tablist" className="flex items-center gap-0.5 rounded-[9px] bg-inset p-0.5">
              {(["home", "agent", "ledger"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  data-press-row
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "relative rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors duration-150",
                    view === v ? "bg-surface text-ink shadow-hairline" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {v}
                  {v === "ledger" && ledger && ledger.summary.total > 0 && (
                    <span className="ml-1.5 font-mono text-[10px] text-ink-3 tabular-nums">{ledger.summary.total}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </header>

        {view === "home" ? (
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <Home
              accounts={accounts}
              setupHint={ready === false ? hint : null}
              ledger={ledger}
              connectors={connectors}
              onInvestigate={(a) => {
                setView("agent");
                ask(`Investigate @${a.name} and run the save play if the evidence warrants it.`, a.id);
              }}
            />
          </div>
        ) : view === "ledger" ? (
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-2">
            <Ledger
              entries={ledger?.entries ?? []}
              summary={ledger?.summary ?? {
                total: 0, executed: 0, verified: 0, blocked: 0, skipped: 0, failed: 0, runs: 0, apps: [],
              }}
              metrics={ledger?.metrics ?? null}
              evals={ledger?.evals ?? { passed: 0, total: 0, mustNot: 0 }}
              ephemeral={ledger?.ephemeral}
            />
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="mx-auto flex w-full max-w-[740px] flex-col gap-7">
                {!turns.length && <Welcome connectors={connectors} modelReady={modelReady} hint={hint} onPick={(q) => ask(q)} />}
                {turns.map((t) => (
                  <TurnView key={t.id} t={t} onDecide={decide} onReplay={replay} isLast={t.id === current?.id} />
                ))}
              </div>
            </div>

            <div className="border-t border-line px-5 py-3">
              <div className="mx-auto w-full max-w-[740px]">
                <Composer accounts={mentions} busy={busy || ready === false}
                  onSubmit={(text, mentioned) => ask(text, mentioned)} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ── one conversational turn ─────────────────────────────────────────── */

function TurnView({ t, onDecide, onReplay, isLast }: {
  t: Turn; onDecide: (a: boolean) => void; onReplay: (planId: string, label: string) => void; isLast: boolean;
}) {
  const [showTrace, setShowTrace] = useState(false);
  const [showProse, setShowProse] = useState(true);
  /* The gate is the one moment the run stops for a person. Scrolling to the
     bottom of the transcript can leave it above the fold, so bring the gate
     itself into view rather than the end of the page. */
  const gateRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!t.gate || !isLast || asked.current) return;
    asked.current = true;
    requestAnimationFrame(() =>
      gateRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, [t.gate, isLast]);
  const thinking = t.phase === "investigating" && !t.snapshot;
  const lastTool = t.tools[t.tools.length - 1];
  const done = t.tools.filter((c) => c.summary).length;
  const apps = t.snapshot ? new Set(t.snapshot.evidence.map((e) => e.source)).size : 0;

  return (
    <div className="flex flex-col gap-3.5" style={{ animation: "fade-up 420ms var(--ease-out) both" }}>
      {/* operator */}
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-[14px] rounded-br-[5px] bg-inset px-3 py-2 text-[13px] leading-snug text-ink shadow-hairline">
          {t.instruction}
        </p>
      </div>

      {(t.phase === "investigating" || t.phase === "executing") && (
        <LoadingState
          label={
            t.phase === "executing" ? "Executing the play"
            : lastTool && !lastTool.summary ? "Reading external apps"
            : "Investigating"
          }
          detail={lastTool && !lastTool.summary ? lastTool.name : undefined}
          startedAt={t.startedAt}
        />
      )}

      {/* trace: one line once it has served its purpose, expandable to the calls */}
      {t.tools.length > 0 && (
        <div>
          <button type="button" data-press onClick={() => setShowTrace((v) => !v)} aria-expanded={showTrace}
            className="-ml-1 flex items-center gap-2 rounded-[7px] px-1 py-0.5 transition-colors duration-150 hover:bg-hover">
            <span className="flex size-3.5 items-center justify-center rounded-full bg-green-tint text-green">
              <Glyph d={PATHS.check} size={8} strokeWidth={4} />
            </span>
            <span className="font-mono text-[11px] text-ink-2">
              {done} tool call{done === 1 ? "" : "s"}
              {apps > 0 && ` · ${apps} apps read`}
              {t.ms > 0 && ` · ${(t.ms / 1000).toFixed(1)}s`}
            </span>
            <span className="text-ink-3 transition-transform duration-300" style={{ transform: showTrace ? "rotate(180deg)" : "none" }}>
              <Glyph d={PATHS.chevron} size={11} strokeWidth={2.4} />
            </span>
          </button>
          <div className="grid transition-[grid-template-rows,opacity] duration-300"
            style={{ gridTemplateRows: showTrace || thinking ? "1fr" : "0fr", opacity: showTrace || thinking ? 1 : 0, transitionTimingFunction: "var(--ease-out)" }}>
            <div className="overflow-hidden">
              <div className="pt-1.5">
                <ToolLog>
                  {t.tools.map((c) => {
                    const [name, subject] = (c.summary ?? "").includes("·") && c.name === "get_account_snapshot"
                      ? [c.name, (c.summary ?? "").split("·")[0].trim()]
                      : [c.name, undefined];
                    const meta = c.summary
                      ? c.name === "get_account_snapshot" ? (c.summary.split("·").slice(1).join("·").trim() || undefined) : c.summary
                      : undefined;
                    return (
                      <ToolCard key={c.id} tool={name} title={subject} meta={meta}
                        status={c.summary ? "success" : "running"}
                        collapseOnComplete
                        defaultOpen={!c.summary}>
                        {c.details?.length ? (
                          <ul className="flex flex-col gap-1">
                            {c.details.map((d, i) => (
                              <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-ink-2">
                                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-line-strong" />
                                <span className="min-w-0">{d}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </ToolCard>
                    );
                  })}
                </ToolLog>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THE FINDING — leads, because it is what the operator actually needs */}
      {t.snapshot && <CaseFile s={t.snapshot} />}

      {/* the agent's own account of it, secondary once the data is on screen */}
      {(t.reasoning || thinking) && (
        <div>
          {t.snapshot && (
            <button type="button" data-press onClick={() => setShowProse((v) => !v)} aria-expanded={showProse}
              className="-ml-1 mb-1 flex items-center gap-1.5 rounded-[7px] px-1 py-0.5 transition-colors duration-150 hover:bg-hover">
              <span className="text-[10px] font-semibold tracking-[0.06em] text-ink uppercase">Agent reasoning</span>
              <span className="font-mono text-[10.5px] text-ink-3">cited</span>
              <span className="text-ink-3 transition-transform duration-300" style={{ transform: showProse ? "rotate(180deg)" : "none" }}>
                <Glyph d={PATHS.chevron} size={11} strokeWidth={2.4} />
              </span>
            </button>
          )}
          <div className="grid transition-[grid-template-rows,opacity] duration-300"
            style={{ gridTemplateRows: showProse ? "1fr" : "0fr", opacity: showProse ? 1 : 0, transitionTimingFunction: "var(--ease-out)" }}>
            <div className="overflow-hidden">
              <div className={cn("rounded-card p-3.5", t.snapshot ? "bg-inset" : "bg-surface shadow-card")}>
                <AgentProse text={t.reasoning} evidence={t.evidence} live={t.phase === "investigating"} cited />
              </div>
            </div>
          </div>
        </div>
      )}

      {t.decisions.length > 0 && (
        <Block label="What the rules said" sub="fixed rules — they run after the model and cannot be argued with">
          <PolicyPanel decisions={t.decisions} />
        </Block>
      )}

      {t.gate && isLast && (
        <div ref={gateRef}>
          <ApprovalGate {...t.gate} busy={t.phase === "executing"} onDecide={onDecide} />
        </div>
      )}

      {t.rows.length > 0 && (
        <Block label="What Keel did" sub="never twice — and each one checked afterwards in the app itself">
          <ActionTimeline rows={t.rows} />
        </Block>
      )}

      {t.tally && (
        <div className="flex flex-col gap-2">
          <Receipts actions={t.rows.flatMap((r) => (r.result ? [r.result] : []))} seconds={t.ms / 1000} />
          {t.plan && t.tally.executed > 0 && (
            <button type="button" data-press onClick={() => onReplay(t.plan!.id, t.snapshot?.name ?? "this account")}
              className="group flex items-center gap-2 self-start rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover-2 hover:text-ink">
              <Glyph d={PATHS.retry} size={12} />
              Replay this exact plan
              <span className="font-mono text-[10.5px] text-ink-3">proves idempotency</span>
            </button>
          )}
        </div>
      )}

      {t.metrics && (
        /* The run's own cost, stated where the run happened. The two phases are
           shown apart because that gap is the claim: the half that decides is
           the slow half, and the half that acts never calls a model. */
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5 font-mono text-[10.5px] text-ink-3">
          <span>{t.metrics.steps} steps</span>
          <span aria-hidden>·</span>
          <span>{t.metrics.toolCalls} tool calls</span>
          <span aria-hidden>·</span>
          <span>{formatTokens(t.metrics.inputTokens + t.metrics.outputTokens)} tokens</span>
          <span aria-hidden>·</span>
          <span>investigate {formatMs(t.metrics.investigateMs)}</span>
          {t.metrics.executeMs > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-ink-2">execute {formatMs(t.metrics.executeMs)}</span>
            </>
          )}
        </p>
      )}

      {t.error && (
        <div className="rounded-card bg-red-tint p-3 text-[12.5px] text-red shadow-card">
          <p className="font-medium">Run failed</p>
          <p className="mt-0.5 opacity-90">{t.error}</p>
        </div>
      )}
    </div>
  );
}

/* ── small pieces ────────────────────────────────────────────────────── */

function Block({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <h2 className="text-[10px] font-semibold tracking-[0.06em] text-ink uppercase">{label}</h2>
        {sub && <span className="truncate font-mono text-[10.5px] text-ink-3">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ phase }: { phase: Phase }) {
  const map: Record<Phase, { label: string; cls: string }> = {
    investigating: { label: "Investigating", cls: "bg-accent-tint text-accent-ink" },
    awaiting: { label: "Awaiting approval", cls: "bg-amber-tint text-amber" },
    executing: { label: "Executing", cls: "bg-accent-tint text-accent-ink" },
    done: { label: "Complete", cls: "bg-green-tint text-green" },
    error: { label: "Failed", cls: "bg-red-tint text-red" },
  };
  const s = map[phase];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium", s.cls)}>
      {(phase === "investigating" || phase === "executing") && (
        <span className="size-1.5 rounded-full bg-current" style={{ animation: "pulse-ring 1.2s ease-out infinite" }} />
      )}
      {s.label}
    </span>
  );
}

const STARTERS = [
  "Find the account most at risk of churning and run the save play",
  "Which accounts have a failed payment and a renewal inside 14 days?",
  "Investigate Northwind Trading",
];

function Welcome({ connectors, modelReady, hint, onPick }: {
  connectors: Connector[]; modelReady: boolean; hint: string | null; onPick: (q: string) => void;
}) {
  const missing = connectors.filter((c) => !c.configured);
  const blocked = !modelReady || Boolean(hint);
  return (
    <div className="flex flex-col gap-4 pt-6" style={{ animation: "fade-up 500ms var(--ease-out) both" }}>
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Who is quietly about to churn?</h2>
        <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-ink-2">
          Keel reads live billing from Stripe, support tickets from Linear and first-party usage
          telemetry, decides which account is genuinely at risk, then runs a policy-gated recovery
          play — re-reading every app afterwards to prove the work landed.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        {STARTERS.map((s, i) => (
          <button key={s} data-press onClick={() => onPick(s)} disabled={blocked}
            className="group flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-hover-2 disabled:opacity-40"
            style={{ animation: `fade-up 400ms var(--ease-out) ${120 + i * 70}ms both` }}>
            <span className="text-ink-3 transition-colors group-hover:text-accent-ink">
              <Glyph d={PATHS.bolt} size={13} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">{s}</span>
            <span className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
              <Glyph d={PATHS.arrow} size={13} />
            </span>
          </button>
        ))}
      </div>

      {blocked && (
        <div className="flex flex-col gap-1.5 rounded-card bg-amber-tint/40 p-3 shadow-hairline">
          <p className="text-[12px] font-medium text-ink">Finish setup first</p>
          {!modelReady && <Todo>Add <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code> to <code className="font-mono text-[11px]">.env.local</code></Todo>}
          {hint && <Todo>{hint}</Todo>}
          {missing.length > 0 && <Todo>Optional: {missing.map((m) => m.name).join(", ")} — unconfigured actions are dropped from the plan</Todo>}
        </div>
      )}
    </div>
  );
}

function Todo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px] text-ink-2">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber" />
      <span>{children}</span>
    </div>
  );
}
