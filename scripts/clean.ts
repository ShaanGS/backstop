/**
 * Removes issues Backstop opened during testing so the support signal is clean.
 * Keeps the five seeded customer tickets; archives everything else that carries
 * an account prefix.
 */
import "./load-env";
import { LinearClient } from "@linear/sdk";
import { seedAccounts } from "../lib/store";

async function main() {
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });
  const seeded = new Set(
    seedAccounts().flatMap((a) => (a.tickets ?? []).map((t) => `[${a.name}] ${t.title}`)),
  );
  const prefixes = seedAccounts().map((a) => `[${a.name}]`);

  let archived = 0;
  for (const prefix of prefixes) {
    const res = await linear.issues({ filter: { title: { startsWith: prefix } }, first: 50 });
    for (const issue of res.nodes) {
      if (seeded.has(issue.title)) continue;
      await linear.archiveIssue(issue.id);
      console.log(`  archived ${issue.identifier} — ${issue.title}`);
      archived++;
    }
  }
  console.log(`\n  ${archived} test issue(s) archived; ${seeded.size} seeded tickets kept.\n`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
