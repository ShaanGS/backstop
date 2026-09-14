/**
 * Causal diagnosis.
 *
 * Keel's claim is that it finds *why* a customer is leaving, not just that they
 * are. That claim cannot rest on a language model noticing a coincidence in
 * prose — it has to be computed, so it can be wrong in a way someone catches.
 *
 * Two steps, both deterministic:
 *
 *   1. Find when the decline actually began — the onset of the sustained
 *      downturn in the usage series, not merely the largest single drop.
 *   2. Score each open ticket on whether it could have caused that onset:
 *      a cause has to *precede* its effect, and the closer it sits to the
 *      onset the better it explains it. A ticket filed after the decline
 *      began is a symptom or a coincidence, never the cause.
 *
 * The model then explains and sanity-checks the result. It never supplies it.
 */
import type { Ticket, UsageSignal } from "./types";

/** Weekly telemetry: index 0 is the oldest week, the last index is this week. */
const WEEK_DAYS = 7;

export type Onset = {
  /** Index into the usage series where the sustained decline begins. */
  index: number;
  daysAgo: number;
  /** Seats at the last healthy reading, and now. */
  from: number;
  to: number;
  dropPct: number;
  /** Consecutive declining weeks since onset — longer is harder to dismiss. */
  weeks: number;
};

export type Verdict = "likely" | "possible" | "ruled_out";

export type CandidateCause = {
  ticket: Ticket;
  reportedDaysAgo: number;
  /** Days between the ticket being reported and the decline starting.
   *  Positive means it came first, which is the only way round causation works. */
  leadDays: number;
  /** 0-1. How well the timing explains the onset. */
  alignment: number;
  /** 0-1. How capable this class of problem is of driving seats down. */
  severity: number;
  confidence: number;
  verdict: Verdict;
  reason: string;
};

export type Diagnosis = {
  onset: Onset | null;
  causes: CandidateCause[];
  /** One line stating what the evidence supports — including "nothing". */
  summary: string;
};

/**
 * Onset of sustained decline: walk back from the present while weeks keep
 * falling, and take the last reading before that run. A single bad week is
 * noise; a run that reaches the present is a trend.
 */
export function findOnset(usage: UsageSignal): Onset | null {
  const s = usage.series;
  if (s.length < 4) return null;

  let i = s.length - 1;
  while (i > 0 && s[i] < s[i - 1]) i--;
  const weeks = s.length - 1 - i;
  if (weeks < 2) return null; // not yet a trend

  const from = s[i];
  const to = s[s.length - 1];
  const dropPct = from === 0 ? 0 : ((to - from) / from) * 100;
  if (dropPct > -10) return null; // declining, but not materially

  return {
    index: i,
    daysAgo: (s.length - 1 - i) * WEEK_DAYS,
    from,
    to,
    dropPct: Math.round(dropPct * 10) / 10,
    weeks,
  };
}

const SEVERITY: { match: RegExp; weight: number; why: string }[] = [
  { match: /auth|login|sso|access|permission/i, weight: 1.0, why: "locks users out entirely" },
  { match: /outage|down|crash|data.?loss/i, weight: 1.0, why: "makes the product unusable" },
  { match: /performance|timeout|slow|latency/i, weight: 0.7, why: "degrades daily use" },
  { match: /export|integration|sync|api/i, weight: 0.6, why: "breaks a workflow" },
  { match: /bug/i, weight: 0.5, why: "a defect in the product" },
];

function severityOf(t: Ticket): { score: number; why: string } {
  const hay = `${t.title} ${t.labels.join(" ")}`;
  for (const s of SEVERITY) if (s.match.test(hay)) return { score: s.weight, why: s.why };
  return { score: 0.25, why: "no clear user-facing impact" };
}

/**
 * Timing score. A cause reported shortly before the onset explains it best.
 * Reported after the onset: ruled out. Reported long before: the account
 * lived with it, so it explains this decline less well.
 */
function alignmentOf(leadDays: number): number {
  if (leadDays < -WEEK_DAYS) return 0;            // clearly after the decline began
  if (leadDays < 0) return 0.3;                   // same week, direction unclear
  if (leadDays <= 21) return 1 - leadDays / 42;   // the sweet spot, decaying
  return Math.max(0, 0.5 - (leadDays - 21) / 120);
}

export function diagnose(usage: UsageSignal, tickets: Ticket[], now = Date.now()): Diagnosis {
  const onset = findOnset(usage);
  const open = tickets.filter((t) => t.state !== "Done");

  if (!onset) {
    return {
      onset: null,
      causes: [],
      summary: "No sustained usage decline to explain.",
    };
  }

  const causes: CandidateCause[] = open
    .map((t) => {
      const reportedDaysAgo = Math.round((now - Date.parse(t.reportedAt ?? t.createdAt)) / 86_400_000);
      const leadDays = reportedDaysAgo - onset.daysAgo;
      const alignment = alignmentOf(leadDays);
      const sev = severityOf(t);
      const confidence = Math.round(alignment * sev.score * 100) / 100;
      const verdict: Verdict =
        alignment === 0 ? "ruled_out" : confidence >= 0.5 ? "likely" : "possible";
      const when =
        leadDays > 0
          ? `reported ${leadDays}d before the decline began`
          : leadDays === 0
            ? "reported the same week the decline began"
            : `reported ${Math.abs(leadDays)}d after the decline began`;
      return {
        ticket: t,
        reportedDaysAgo,
        leadDays,
        alignment: Math.round(alignment * 100) / 100,
        severity: sev.score,
        confidence,
        verdict,
        reason:
          verdict === "ruled_out"
            ? `${when} — cannot be the cause`
            : `${when}; ${sev.why}`,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const top = causes.find((c) => c.verdict === "likely");
  const summary = top
    ? `Seats fell ${Math.abs(onset.dropPct)}% over ${onset.weeks} weeks starting ${onset.daysAgo}d ago. ` +
      `Most likely cause: ${top.ticket.identifier} — ${top.reason}.`
    : causes.length
      ? `Seats fell ${Math.abs(onset.dropPct)}% over ${onset.weeks} weeks starting ${onset.daysAgo}d ago. ` +
        `No open ticket explains the timing — every candidate was reported after it began. Cause is not in the ticket queue.`
      : `Seats fell ${Math.abs(onset.dropPct)}% over ${onset.weeks} weeks starting ${onset.daysAgo}d ago, ` +
        `with no open tickets at all. Silent churn — nobody complained.`;

  return { onset, causes, summary };
}
