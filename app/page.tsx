"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionTimeline, { type RowState } from "@/components/action-timeline";
import {
  AccountCard, ApprovalGate, EvidenceList, PolicyPanel, ReasoningStream, ToolTrace,
  type AccountRow,
} from "@/components/run-panels";
import { CONNECTOR_MARKS, Glyph, PATHS } from "@/components/icons";
import { cn, money, pct } from "@/lib/utils";
import type { AgentEvent, SnapshotDTO } from "@/lib/agent/loop";
import type { PolicyDecision, Plan, ProposedAction } from "@/lib/types";

type Phase = "idle" | "investigating" | "awaiting" | "executing" | "done" | "error";
type Connector = { id: string; name: string; role: string; direction: string; configured: boolean };

export default function Console() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [modelReady, setModelReady] = useState(true);
  const [model, setModel] = useState("claude-opus-5");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsReady, setAccountsReady] = useState<boolean | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [reasoning, setReasoning] = useState("");
  const [tools, setTools] = useState<{ id: string; name: string; summary?: string }[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotDTO | null>(null);
  const [decisions, setDecisions] = useState<PolicyDecision[]>([]);
  const [gate, setGate] = useState<{ planId: string; rule: string; reason: string; actions: ProposedAction[] } | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [tally, setTally] = useState<{ executed: number; skipped: number; blocked: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    fetch("/api/connectors").then((r) => r.json()).then((d) => {
      setConnectors(d.connectors); setModelReady(d.modelReady); setModel(d.model);
    }).catch(() => {});
  }, []);

  const loadAccounts = useCallback((fresh = false) => {
    setAccountsReady(null);
    fetch(`/api/accounts${fresh ? "?fresh=1" : ""}`).then((r) => r.json()).then((d) => {
      setAccounts(d.accounts ?? []); setAccountsReady(Boolean(d.ready)); setSetupHint(d.reason ?? null);
    }).catch((e) => { setAccountsReady(false); setSetupHint(e.message); });
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    if (phase !== "investigating" && phase !== "executing") return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [reasoning, rows, decisions, gate, tally]);

  function applyEvent(e: AgentEvent) {
    switch (e.type) {
      case "run_started": setPhase("investigating"); break;
      case "thinking_delta": setReasoning((t) => t + e.text); break;
      case "tool_call": setTools((t) => [...t, { id: e.id, name: e.name }]); break;
      case "tool_result":
        setTools((t) => t.map((c) => (c.id === e.id ? { ...c, summary: e.summary } : c))); break;
      case "plan":
        setPlan(e.plan); setSnapshot(e.snapshot);
        setRows(e.plan.actions.map((action) => ({ action, status: "pending" as const })));
        break;
      case "policy": setDecisions(e.decisions); break;
      case "awaiting_approval":
        setGate({ planId: e.planId, rule: e.rule, reason: e.reason, actions: e.actions });
        setPhase("awaiting");
        break;
      case "action_started":
        setPhase("executing");
        setRows((r) => r.map((row, i) => (i === e.index ? { ...row, status: "running" } : row)));
        break;
      case "action_result":
        setRows((r) => r.map((row, i) => (i === e.index ? { ...row, status: e.result.status, result: e.result } : row)));
        break;
      case "run_finished":
        setTally({ executed: e.executed, skipped: e.skipped, blocked: e.blocked, failed: e.failed });
        setPhase("done"); setGate(null);
        break;
      case "error": setError(e.message); setPhase("error"); break;
    }
  }

  async function consume(res: Response) {
    if (!res.body) throw new Error("No response stream.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line) as AgentEvent);
    }
  }

  async function run(accountId?: string) {
    setPhase("investigating"); setReasoning(""); setTools([]); setPlan(null); setSnapshot(null);
    setDecisions([]); setGate(null); setRows([]); setTally(null); setError(null);
    startedAt.current = Date.now(); setElapsed(0);
    try {
      await consume(await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      }));
      if (phase !== "awaiting") loadAccounts(true);
    } catch (e) { setError((e as Error).message); setPhase("error"); }
  }

  async function decide(approved: boolean) {
    if (!gate) return;
    setPhase("executing"); startedAt.current = Date.now();
    try {
      await consume(await fetch("/api/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: gate.planId, approved }),
      }));
      loadAccounts(true);
    } catch (e) { setError((e as Error).message); setPhase("error"); }
  }

  const busy = phase === "investigating" || phase === "executing";
  const missing = connectors.filter((c) => !c.configured);

  return (
    <div className="grid h-dvh grid-cols-1 lg:grid-cols-[286px_minmax(0,1fr)]">
      {/* ── left rail ─────────────────────────────────────────────────── */}
      <aside className="hidden flex-col border-r border-line bg-canvas lg:flex">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <span className="flex size-6 items-center justify-center rounded-[7px] bg-ink text-surface">
            <Glyph d={PATHS.shield} size={13} strokeWidth={2.2} />
          </span>
          <span className="text-[13.5px] font-semibold tracking-tight text-ink">Backstop</span>
          <span className="ml-auto font-mono text-[10px] text-ink-3">{model}</span>
        </div>

        <div className="px-3 pb-2">
          <p className="px-1 pb-1.5 text-[10.5px] font-medium tracking-wide text-ink-3 uppercase">Connected apps</p>
          <div className="flex flex-col gap-px">
            {connectors.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-[8px] px-1.5 py-1.5">
                <span className="flex size-4 shrink-0 items-center justify-center">{CONNECTOR_MARKS[c.id]}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{c.name}</span>
                <span className="font-mono text-[9.5px] text-ink-3">{c.direction}</span>
                <span className={cn("size-1.5 rounded-full", c.configured ? "bg-green" : "bg-line-strong")} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 pt-1">
          <div className="flex items-center px-1 pb-1.5">
            <p className="text-[10.5px] font-medium tracking-wide text-ink-3 uppercase">Book of business</p>
            <button onClick={() => loadAccounts(true)} disabled={busy}
              className="ml-auto text-ink-3 transition-colors hover:text-ink disabled:opacity-40" aria-label="Refresh">
              <Glyph d={PATHS.retry} size={12} />
            </button>
          </div>
          <div className="scroll-slim -mx-1 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1 pb-3">
            {accountsReady === null && <Skeletons />}
            {accountsReady === false && (
              <p className="rounded-card bg-surface p-2.5 text-[11.5px] leading-snug text-ink-2 shadow-card">{setupHint}</p>
            )}
            {accounts.map((a) => (
              <AccountCard key={a.id} a={a} active={selected === a.id}
                onClick={() => { setSelected(a.id); if (!busy) run(a.id); }} />
            ))}
          </div>
        </div>
      </aside>

      {/* ── main ──────────────────────────────────────────────────────── */}
      <main className="flex min-h-0 flex-col bg-canvas">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold tracking-tight text-ink">Revenue retention agent</h1>
            <p className="text-[11.5px] text-ink-3">
              Investigates churn risk across five apps · policy-gated · every action verified
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {busy && (
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">{elapsed.toFixed(1)}s</span>
            )}
            <StatusPill phase={phase} />
          </div>
        </header>

        <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
            {phase === "idle" && <EmptyState missing={missing} modelReady={modelReady} hint={setupHint} />}

            {(reasoning || tools.length > 0) && (
              <Section label="Investigation" sub="model-driven · read-only tools">
                <ToolTrace calls={tools} />
                <div className="mt-2.5 rounded-card bg-surface p-3 shadow-card">
                  <ReasoningStream text={reasoning} live={phase === "investigating"} />
                </div>
              </Section>
            )}

            {snapshot && (
              <Section label="Evidence" sub={`${snapshot.name} · risk ${snapshot.riskScore}/100`}>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Metric label="MRR" value={`${money(snapshot.mrrCents)}/mo`} />
                  <Metric label="Renewal" value={`${snapshot.daysToRenewal} days`} />
                  <Metric label="Usage" value={pct(snapshot.usageChangePct)} tone={snapshot.usageChangePct < 0 ? "red" : "green"} />
                  {snapshot.tags.map((t) => <Metric key={t} label="Tag" value={t} tone={t === "do-not-contact" ? "red" : undefined} />)}
                </div>
                <EvidenceList items={snapshot.evidence} />
              </Section>
            )}

            {plan && (
              <Section label="Proposed play" sub={`${plan.actions.length} actions · plan ${plan.id}`}>
                <div className="rounded-card bg-surface p-3 shadow-card">
                  <p className="text-[13px] leading-relaxed text-ink">{plan.rationale}</p>
                </div>
              </Section>
            )}

            {decisions.length > 0 && (
              <Section label="Policy" sub="deterministic · runs after the model, before any write">
                <PolicyPanel decisions={decisions} />
              </Section>
            )}

            {gate && <ApprovalGate {...gate} busy={phase === "executing"} onDecide={decide} />}

            {rows.length > 0 && (
              <Section label="Execution" sub="idempotent · verified by read-back">
                <ActionTimeline rows={rows} />
              </Section>
            )}

            {tally && <Tally {...tally} seconds={elapsed} />}
            {error && (
              <div className="rounded-card bg-red-tint p-3 text-[12.5px] text-red shadow-card">
                <p className="font-medium">Run failed</p>
                <p className="mt-0.5 opacity-90">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line px-5 py-3">
          <div className="mx-auto flex w-full max-w-[720px] items-center gap-2">
            <button type="button" disabled={busy || accountsReady === false} onClick={() => run()}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[11px] bg-ink text-[13px] font-medium text-surface transition-transform duration-150 enabled:active:scale-[0.99] disabled:opacity-40">
              <Glyph d={PATHS.bolt} size={14} strokeWidth={2.2} />
              {busy ? "Agent is working…" : "Find the account most at risk and run the save play"}
            </button>
            {tally && (
              <button type="button" onClick={() => run(selected ?? undefined)} disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-[11px] bg-surface px-3 text-[12.5px] font-medium text-ink-2 shadow-card transition-colors hover:text-ink disabled:opacity-40">
                <Glyph d={PATHS.retry} size={13} />
                Re-run
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── small pieces ──────────────────────────────────────────────────────── */

function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ animation: "fade-up 420ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <h2 className="text-[11px] font-semibold tracking-wide text-ink uppercase">{label}</h2>
        {sub && <span className="truncate font-mono text-[10.5px] text-ink-3">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-chip bg-surface px-2 text-[11.5px] shadow-card">
      <span className="text-ink-3">{label}</span>
      <span className={cn("font-mono tabular-nums", tone === "red" ? "text-red" : tone === "green" ? "text-green" : "text-ink")}>{value}</span>
    </span>
  );
}

function StatusPill({ phase }: { phase: Phase }) {
  const map: Record<Phase, { label: string; cls: string }> = {
    idle: { label: "Ready", cls: "bg-inset text-ink-2" },
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

function Tally({ executed, skipped, blocked, failed, seconds }: { executed: number; skipped: number; blocked: number; failed: number; seconds: number }) {
  const items = [
    { n: executed, label: "executed & verified", cls: "text-green" },
    { n: skipped, label: "skipped (idempotent)", cls: "text-ink-2" },
    { n: blocked, label: "blocked by policy", cls: "text-red" },
    { n: failed, label: "failed", cls: "text-red" },
  ].filter((i) => i.n > 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card bg-surface px-3.5 py-3 shadow-card"
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
      {items.map((i) => (
        <span key={i.label} className="flex items-baseline gap-1.5">
          <span className={cn("font-mono text-[15px] font-semibold tabular-nums", i.cls)}>{i.n}</span>
          <span className="text-[12px] text-ink-2">{i.label}</span>
        </span>
      ))}
      <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">{seconds.toFixed(1)}s</span>
    </div>
  );
}

function Skeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[58px] rounded-card bg-inset" style={{ animation: `fade-in 400ms ease-out ${i * 80}ms both`, opacity: 0.6 }} />
      ))}
    </>
  );
}

function EmptyState({ missing, modelReady, hint }: { missing: Connector[]; modelReady: boolean; hint: string | null }) {
  const blocked = !modelReady || missing.length > 0 || hint;
  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <h2 className="text-[14px] font-semibold text-ink">
        {blocked ? "Finish setup to run the agent" : "Ready when you are"}
      </h2>
      <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-2">
        Backstop reads live billing from Stripe, support tickets from Linear and first-party
        usage telemetry, decides which account is quietly heading for churn, then runs a
        policy-gated recovery play across Linear, Notion, Resend and Slack — re-reading every
        app afterwards to prove the work landed.
      </p>
      {blocked && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-[10px] bg-inset p-2.5">
          {!modelReady && <Todo>Add <code className="font-mono">ANTHROPIC_API_KEY</code> to <code className="font-mono">.env.local</code></Todo>}
          {missing.map((m) => <Todo key={m.id}>Configure {m.name} — {m.role}</Todo>)}
          {hint && <Todo>{hint}</Todo>}
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
