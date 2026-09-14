/** Linear connector — READ (support signal) + WRITE (recovery task) + verify. */
import { LinearClient } from "@linear/sdk";
import { requireEnv } from "../env";
import type { Ticket, VerificationResult } from "../types";

let client: LinearClient | null = null;
export function linear(): LinearClient {
  requireEnv("linear");
  client ??= new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });
  return client;
}

/** Label applied to every issue Keel opens, so its own work is never
 *  mistaken for a customer-reported problem on the next run. */
export const RECOVERY_LABEL = "keel-recovery";
/** Tickets opened before the rename still carry the old label. */
export const RECOVERY_LABELS = [RECOVERY_LABEL, "backstop-recovery"];

/** Issues are namespaced per account by a `[Account Name]` title prefix. */
export function titlePrefix(accountName: string) {
  return `[${accountName}]`;
}

export async function getTickets(accountName: string): Promise<Ticket[]> {
  const l = linear();
  const res = await l.issues({
    filter: { title: { startsWith: titlePrefix(accountName) } },
    first: 25,
  });
  const out: Ticket[] = [];
  for (const issue of res.nodes) {
    const [state, labels] = await Promise.all([issue.state, issue.labels()]);
    const opened = /Opened (\d+) days ago/.exec(issue.description ?? "");
    const names = labels.nodes.map((n) => n.name);
    // Exclude Keel's own recovery tasks: they are the output of a previous
    // run, not evidence of customer pain, and counting them would let the agent
    // escalate an account on the strength of its own earlier actions.
    if (names.some((n) => RECOVERY_LABELS.includes(n.toLowerCase()))) continue;
    out.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title.replace(titlePrefix(accountName), "").trim(),
      url: issue.url,
      labels: names,
      state: state?.name ?? "Unknown",
      createdAt: issue.createdAt.toISOString(),
      reportedAt: opened
        ? new Date(Date.now() - Number(opened[1]) * 86_400_000).toISOString()
        : issue.createdAt.toISOString(),
    });
  }
  return out;
}

export async function defaultTeamId(): Promise<string> {
  const teams = await linear().teams({ first: 1 });
  const team = teams.nodes[0];
  if (!team) throw new Error("No Linear team found for this API key.");
  return team.id;
}

/** Finds or creates the recovery label on the team. */
async function recoveryLabelId(teamId: string): Promise<string | undefined> {
  try {
    const team = await linear().team(teamId);
    const labels = await team.labels();
    const hit = labels.nodes.find((l) => l.name.toLowerCase() === RECOVERY_LABEL);
    if (hit) return hit.id;
    const created = await linear().createIssueLabel({ teamId, name: RECOVERY_LABEL, color: "#5a50e0" });
    return (await created.issueLabel)?.id;
  } catch {
    return undefined;
  }
}

export async function createIssue(input: {
  title: string;
  description: string;
  priority?: number;
}): Promise<{ id: string; url: string; identifier: string }> {
  const teamId = await defaultTeamId();
  const labelId = await recoveryLabelId(teamId);
  const payload = await linear().createIssue({
    teamId,
    title: input.title,
    description: input.description,
    priority: input.priority ?? 2,
    ...(labelId ? { labelIds: [labelId] } : {}),
  });
  const issue = await payload.issue;
  if (!issue) throw new Error("Linear returned no issue on create.");
  return { id: issue.id, url: issue.url, identifier: issue.identifier };
}

/** Post-action verification: re-fetch the issue by ID and confirm it is real. */
export async function verifyIssue(id: string, expectTitle: string): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  try {
    const issue = await linear().issue(id);
    const ok = Boolean(issue?.id) && issue.title === expectTitle;
    return {
      verified: ok,
      method: "linear.issue(id)",
      detail: ok
        ? `Issue ${issue.identifier} exists with matching title.`
        : `Issue fetched but title mismatch: "${issue?.title}".`,
      checkedAt,
    };
  } catch (err) {
    return {
      verified: false,
      method: "linear.issue(id)",
      detail: `Re-fetch failed: ${(err as Error).message}`,
      checkedAt,
    };
  }
}
