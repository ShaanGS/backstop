import Link from "next/link";
import { Mark, Wordmark } from "@/components/brand";
import { BrandMark, Glyph, PATHS } from "@/components/icons";
import { CONNECTOR_META } from "@/lib/env";
import type { ConnectorId } from "@/lib/types";

/* ─────────────────────────────────────────────────────────
 * LANDING
 * Server-rendered, no client JS. Same tokens as the console,
 * so the marketing page and the product are visibly one thing.
 * ───────────────────────────────────────────────────────── */

export const metadata = {
  title: "Keel — spots the customer about to leave",
  description:
    "An autonomous revenue-retention agent. Investigates across five apps, stops for a human before anything irreversible, and proves every action by reading the app back.",
};

/* A hairline bracket on each corner — the device that makes a plain card read
   as something measured rather than something decorated. */
function Bracketed({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const c = "pointer-events-none absolute size-3 border-accent";
  return (
    <div className={`relative border border-line bg-surface ${className}`}>
      <span className={`${c} -top-px -left-px border-t-2 border-l-2`} />
      <span className={`${c} -top-px -right-px border-t-2 border-r-2`} />
      <span className={`${c} -bottom-px -left-px border-b-2 border-l-2`} />
      <span className={`${c} -right-px -bottom-px border-r-2 border-b-2`} />
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block border border-accent/35 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
      {children}
    </span>
  );
}

/** The diagonal rule that separates sections. */
function Hatch() {
  return (
    <div
      aria-hidden
      className="h-14 w-full border-y border-line"
      style={{
        backgroundImage:
          "repeating-linear-gradient(115deg, var(--line) 0 1px, transparent 1px 9px)",
      }}
    />
  );
}

const ORDER: ConnectorId[] = ["stripe", "linear", "slack", "notion", "resend"];

const STEPS = [
  {
    n: "01",
    title: "It goes and looks",
    body: "Reads billing from Stripe, support tickets from Linear, and your own usage data. Nobody hands it a checklist — it decides which accounts to open and when it has seen enough.",
  },
  {
    n: "02",
    title: "It stops for you",
    body: "Before anything a customer would see, a deterministic policy engine runs on the proposed plan. It can block an action outright, or hold the whole play for a human. The model does not get a vote.",
  },
  {
    n: "03",
    title: "It proves the work landed",
    body: "After every write, Keel re-fetches the record from the app that should now hold it. An action is only done when the external system says so — and the whole trail is on the record.",
  },
];

const FEATURES = [
  {
    icon: PATHS.search,
    title: "Finds the reason, not just the risk",
    body: "A usage cliff is a symptom. Keel links it to the unresolved bug that caused it, and cites the ticket.",
  },
  {
    icon: PATHS.lock,
    title: "Refuses, and says why",
    body: "Legal flags, open escalations, contact cooldowns and enterprise thresholds are plain code — auditable, and impossible to talk out of.",
  },
  {
    icon: PATHS.check,
    title: "Never acts twice",
    body: "Every write is keyed and looked up first. Replay a save play and nothing duplicates — no second email to the same customer.",
  },
  {
    icon: PATHS.doc,
    title: "Keeps the receipts",
    body: "Everything it did, refused, or skipped, rebuilt from an append-only trail that outlives the session.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-canvas">
      {/* ── nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-[1140px] items-center px-5">
          <Wordmark />
          <div className="ml-auto hidden items-center gap-7 text-[13px] text-ink-2 sm:flex">
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
            <a href="#proof" className="transition-colors hover:text-ink">Reliability</a>
            <a href="#apps" className="transition-colors hover:text-ink">Apps</a>
            <a href="https://github.com/ShaanGS/keel" className="transition-colors hover:text-ink">GitHub</a>
          </div>
          <Link
            href="/console"
            className="ml-5 inline-flex h-8 items-center gap-2 rounded-[8px] bg-ink px-3 text-[12.5px] font-medium text-canvas transition-opacity hover:opacity-90"
          >
            Open the console
            <Glyph d={PATHS.arrow} size={12} strokeWidth={2.4} />
          </Link>
        </nav>
      </header>

      {/* ── hero ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1140px] px-5 py-16 sm:py-24">
        <div className="grid items-end gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="mb-5 flex items-center gap-2 text-[12.5px] text-ink-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                Live
              </span>
              Five apps connected, every action verified
            </p>
            <h1 className="text-[44px] leading-[1.04] font-semibold tracking-[-0.035em] text-ink sm:text-[62px]">
              Spots the customer
              <br />
              about to leave
            </h1>
          </div>
          <div className="pb-2">
            <p className="text-[15px] leading-[1.6] text-ink-2">
              Every software company loses customers it could have saved. Quietly — someone stops
              logging in, a payment fails, a bug ticket sits open. Keel puts those signals together,
              acts on them, and proves what it did.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/console"
                className="inline-flex h-11 items-center gap-2.5 bg-accent px-5 text-[13px] font-semibold tracking-[0.02em] text-white uppercase transition-opacity hover:opacity-90"
              >
                Open the console
                <Glyph d={PATHS.arrow} size={14} strokeWidth={2.4} />
              </Link>
              <a
                href="https://github.com/ShaanGS/keel#how-i-tested-and-verified-it-works"
                className="inline-flex h-11 items-center border border-line px-5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
              >
                How it was verified
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── the apps ────────────────────────────────────────────────── */}
      <div id="apps" className="border-y border-line bg-inset/40">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-y-6 px-5 py-7">
          {ORDER.map((id) => (
            <div key={id} className="flex items-center gap-2.5">
              <BrandMark id={id} size={20} />
              <span className="text-[14px] font-medium text-ink-2">{CONNECTOR_META[id].name}</span>
              <span className="font-mono text-[10px] tracking-tight text-ink-3">
                {CONNECTOR_META[id].direction}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── the product ─────────────────────────────────────────────── */}
      <section className="bg-inset/40 px-5 pb-16">
        <div className="mx-auto max-w-[1140px]">
          <div className="border border-line bg-surface p-2 shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/console.png"
              alt="The Keel console mid-investigation: risk meter, the numbers behind it, and the seat collapse against its baseline"
              className="w-full"
            />
          </div>
        </div>
      </section>

      <Hatch />

      {/* ── how it works ────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-[1140px] px-5 py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-5 text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-[42px]">
              The model investigates.
              <br />
              The runtime decides.
            </h2>
          </div>
          <p className="self-end text-[14.5px] leading-[1.6] text-ink-2">
            Judgment is the part a language model is good at. Nothing irreversible should depend on
            it. So Keel splits the job in two — and only one half is allowed to improvise.
          </p>
        </div>

        <div className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-surface p-6">
              <p className="text-[28px] leading-none font-semibold tracking-[-0.03em] text-accent tabular-nums">{s.n}</p>
              <h3 className="mt-6 text-[16px] font-semibold tracking-[-0.01em] text-ink">{s.title}</h3>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Hatch />

      {/* ── features ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1140px] px-5 py-20">
        <div className="text-center">
          <Eyebrow>What makes it different</Eyebrow>
          <h2 className="mx-auto mt-5 max-w-[640px] text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-[42px]">
            An agent you could actually let near a customer
          </h2>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Bracketed key={f.title} className="p-6">
              <span className="flex size-9 items-center justify-center bg-accent text-white">
                <Glyph d={f.icon} size={16} strokeWidth={2.2} />
              </span>
              <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.01em] text-ink">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-2">{f.body}</p>
            </Bracketed>
          ))}
        </div>
      </section>

      <Hatch />

      {/* ── proof ───────────────────────────────────────────────────── */}
      <section id="proof" className="mx-auto max-w-[1140px] px-5 py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Eyebrow>Reliability</Eyebrow>
            <h2 className="mt-5 text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-[42px]">
              Five of the fourteen tests check that Keel does nothing
            </h2>
            <p className="mt-5 text-[14.5px] leading-[1.6] text-ink-2">
              Anyone can demonstrate an agent doing something. The harder claim is that it declines
              when it should — on a legal hold, inside a contact cooldown, above an enterprise
              threshold, or when the work was already done. Those cases run on every commit.
            </p>
            <a
              href="https://github.com/ShaanGS/keel/blob/main/evals/REPORT.md"
              className="mt-6 inline-flex items-center gap-2 text-[13.5px] font-medium text-accent"
            >
              Read the scorecard
              <Glyph d={PATHS.arrow} size={13} strokeWidth={2.4} />
            </a>
          </div>

          <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
            {[
              { n: "14/14", l: "reliability cases pass", t: "text-green" },
              { n: "5", l: "assert it does nothing", t: "text-red" },
              { n: "100%", l: "of writes read back", t: "text-ink" },
              { n: "0", l: "duplicate actions on replay", t: "text-ink" },
            ].map((k) => (
              <div key={k.l} className="bg-surface p-6">
                <p className={`text-[34px] leading-none font-semibold tracking-[-0.04em] tabular-nums ${k.t}`}>{k.n}</p>
                <p className="mt-2.5 text-[12.5px] leading-snug text-ink-2">{k.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1140px] px-5 pt-14">
          <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Wordmark />
              <p className="mt-3 max-w-[300px] text-[13px] leading-[1.6] text-ink-2">
                An autonomous revenue-retention agent. It finds why a customer is leaving, acts on it, and proves every action.
              </p>
            </div>
            <div>
              <p className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Product</p>
              <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
                <li><Link href="/console" className="transition-colors hover:text-ink">Console</Link></li>
                <li><a href="#how" className="transition-colors hover:text-ink">How it works</a></li>
                <li><a href="#proof" className="transition-colors hover:text-ink">Reliability</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Source</p>
              <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
                <li><a href="https://github.com/ShaanGS/keel" className="transition-colors hover:text-ink">GitHub</a></li>
                <li><a href="https://github.com/ShaanGS/keel/blob/main/evals/REPORT.md" className="transition-colors hover:text-ink">Scorecard</a></li>
                <li><a href="https://github.com/ShaanGS/keel#architecture" className="transition-colors hover:text-ink">Architecture</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-line py-5 text-[12px] text-ink-3">
            <span>© 2026 Keel. MIT licensed.</span>
            <span className="ml-auto flex items-center gap-1.5">
              Every customer email is sandboxed outside production
              <Mark size={12} />
            </span>
          </div>
        </div>

        {/* The oversized wordmark, cropped by the viewport — the one flourish. */}
        <div aria-hidden className="overflow-hidden px-5 pb-2">
          <p className="mx-auto max-w-[1140px] text-center text-[18vw] leading-[0.78] font-semibold tracking-[-0.055em] text-ink/[0.055] select-none">
            keel
          </p>
        </div>
      </footer>
    </div>
  );
}
