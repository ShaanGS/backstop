"use client";

import { useMemo, useState } from "react";
import { CONNECTOR_MARKS, Glyph, PATHS } from "./icons";
import { cn } from "@/lib/utils";
import type { Evidence } from "@/lib/types";

/* ─────────────────────────────────────────────────────────
 * AGENT PROSE
 * The model's reasoning, streamed. Inline [stripe-2] markers
 * are replaced with citation chips that link back to the real
 * record in the source app — a claim you can click through to.
 * ───────────────────────────────────────────────────────── */

const CITE = /\[([a-z]+-\d+)\]/g;
/** The model writes light markdown. We render bold and drop heading hashes
 *  rather than shipping raw asterisks to the operator. */
const BOLD = /\*\*([^*]+)\*\*/g;

function SourceChip({ e }: { e: Evidence }) {
  const label = e.source === "usage" ? "telemetry" : e.source;
  const body = (
    <>
      <span className="flex size-3 shrink-0 items-center justify-center [&_svg]:size-3">
        {CONNECTOR_MARKS[e.source] ?? CONNECTOR_MARKS.usage}
      </span>
      <span className="font-mono text-[10px] leading-none">{label}</span>
    </>
  );
  const cls =
    "mx-0.5 inline-flex h-[17px] translate-y-[1px] items-center gap-1 rounded-[5px] bg-inset px-1 align-baseline text-ink-2 shadow-hairline transition-colors duration-150 hover:bg-hover hover:text-ink";
  return e.url ? (
    <a href={e.url} target="_blank" rel="noreferrer" title={`${e.label} — ${e.detail}`} className={cls}
      style={{ animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
      {body}
    </a>
  ) : (
    <span title={`${e.label} — ${e.detail}`} className={cls}
      style={{ animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
      {body}
    </span>
  );
}

/** Splits the streamed text into words and citation chips, preserving order. */
function useTokens(text: string, evidence: Evidence[]) {
  return useMemo(() => {
    const byKey = new Map(evidence.map((e) => [e.key, e]));
    const out: ({ w: string; b?: boolean } | { cite: Evidence } | { raw: string })[] = [];

    // Strip heading hashes; keep the words, lose the markup.
    const clean = text.replace(/^#{1,6}\s+/gm, "");

    const pushWords = (chunk: string) => {
      let cursor = 0;
      for (const b of chunk.matchAll(BOLD)) {
        for (const w of chunk.slice(cursor, b.index).split(/(\s+)/)) if (w) out.push({ w });
        for (const w of b[1].split(/(\s+)/)) if (w) out.push({ w, b: true });
        cursor = b.index + b[0].length;
      }
      for (const w of chunk.slice(cursor).split(/(\s+)/)) if (w) out.push({ w });
    };

    let last = 0;
    for (const m of clean.matchAll(CITE)) {
      pushWords(clean.slice(last, m.index));
      const hit = byKey.get(m[1]);
      out.push(hit ? { cite: hit } : { raw: m[0] });
      last = m.index + m[0].length;
    }
    pushWords(clean.slice(last));
    return out;
  }, [text, evidence]);
}

export default function AgentProse({
  text, evidence, live, cited,
}: {
  text: string;
  evidence: Evidence[];
  live: boolean;
  /** Show the collapsible source list beneath the prose. */
  cited?: boolean;
}) {
  const tokens = useTokens(text, evidence);
  const [open, setOpen] = useState(false);
  const used = useMemo(() => {
    const keys = new Set([...text.matchAll(CITE)].map((m) => m[1]));
    return evidence.filter((e) => keys.has(e.key));
  }, [text, evidence]);

  if (!text && !live) return null;

  return (
    <div>
      <p className="text-[13.5px] leading-[1.65] whitespace-pre-wrap text-ink">
        {tokens.map((t, i) =>
          "cite" in t ? (
            <SourceChip key={i} e={t.cite} />
          ) : "raw" in t ? (
            <span key={i} className="text-ink-3">{t.raw}</span>
          ) : /^\s+$/.test(t.w) ? (
            <span key={i}>{t.w}</span>
          ) : (
            <span key={i} className={cn("inline", t.b && "font-semibold text-ink")}
              style={{ animation: "word-in 340ms cubic-bezier(0.23,1,0.32,1) both" }}>
              {t.w}
            </span>
          ),
        )}
        {live && (
          <span className="ml-1 inline-block h-[13px] w-[2px] translate-y-[2px] rounded-full bg-accent align-baseline"
            style={{ animation: "caret 1s steps(2) infinite" }} />
        )}
      </p>

      {cited && used.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="mt-2 flex items-center gap-1.5 rounded-[7px] px-1 py-0.5 -ml-1 transition-colors duration-150 hover:bg-hover">
            <span className="flex -space-x-1">
              {used.slice(0, 4).map((e) => (
                <span key={e.key}
                  className="flex size-[15px] items-center justify-center rounded-full bg-surface shadow-[0_0_0_1.5px_var(--canvas)] [&_svg]:size-[11px]">
                  {CONNECTOR_MARKS[e.source] ?? CONNECTOR_MARKS.usage}
                </span>
              ))}
            </span>
            <span className="text-[11.5px] text-ink-2">
              {used.length} source{used.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink-3 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }}>
              <Glyph d={PATHS.chevron} size={11} strokeWidth={2.4} />
            </span>
          </button>

          <div className="grid transition-[grid-template-rows,opacity] duration-300"
            style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}>
            <div className="overflow-hidden">
              <div className="mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
                {used.map((e) => {
                  const Row = e.url ? "a" : "div";
                  return (
                    <Row key={e.key} {...(e.url ? { href: e.url, target: "_blank", rel: "noreferrer" } : {})}
                      className={cn(
                        "flex items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-[12px] transition-colors duration-150",
                        e.url && "hover:bg-hover",
                      )}>
                      <span className="mt-px flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
                        {CONNECTOR_MARKS[e.source] ?? CONNECTOR_MARKS.usage}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("font-medium text-ink", e.url && "animated-underline")}>{e.label}</span>
                        <span className="block text-ink-2">{e.detail}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-3">{e.key}</span>
                    </Row>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
