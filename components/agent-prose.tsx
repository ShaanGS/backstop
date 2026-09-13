"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark, Glyph, PATHS } from "./icons";
import { cn } from "@/lib/utils";
import type { Evidence } from "@/lib/types";

/* ─────────────────────────────────────────────────────────
 * AGENT PROSE
 * The model's reasoning, streamed. Inline [stripe-2] markers
 * become citation chips linking to the real record.
 *
 * Deliberately cheap to render: text runs stay whole strings
 * rather than one element per word. An earlier version wrapped
 * every word in an animated span with a blur filter, which put
 * hundreds of compositing layers on screen and re-triggered
 * them on every stream chunk — it read as lag. The streaming
 * itself is the motion; nothing else needs to move.
 *
 * The caret follows the same principle. It holds solid while
 * tokens are landing and only breathes once the stream goes
 * quiet — a blink running underneath moving text reads as a
 * stutter, not a cursor.
 * ───────────────────────────────────────────────────────── */

/** True while tokens are actively landing; false ~320ms after the last one. */
function useTyping(text: string, live: boolean): boolean {
  const [typing, setTyping] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    // The caret's solid/blinking state is derived from stream activity, so an
    // extra render per chunk is the mechanism, not a mistake.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!live) { setTyping(false); return; }
    if (first.current) { first.current = false; return; }
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 320);
    return () => clearTimeout(t);
  }, [text, live]);
  return typing;
}

const CITE = /\[([a-z0-9]+(?:-[a-z0-9]+)+-\d+)\]/g;
const INLINE = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;

type Node =
  | { kind: "text"; text: string }
  | { kind: "b" | "i" | "c"; text: string }
  | { kind: "cite"; e: Evidence }
  | { kind: "dead"; text: string };

function markdownNodes(chunk: string, out: Node[]) {
  let cursor = 0;
  for (const m of chunk.matchAll(INLINE)) {
    if (m.index > cursor) out.push({ kind: "text", text: chunk.slice(cursor, m.index) });
    if (m[1]) out.push({ kind: "b", text: m[1] });
    else if (m[2]) out.push({ kind: "i", text: m[2] });
    else out.push({ kind: "c", text: m[3] });
    cursor = m.index + m[0].length;
  }
  if (cursor < chunk.length) out.push({ kind: "text", text: chunk.slice(cursor) });
}

function nodesFor(text: string, byKey: Map<string, Evidence>): Node[] {
  const clean = text.replace(/^#{1,6}\s+/gm, "");
  const out: Node[] = [];
  let last = 0;
  for (const m of clean.matchAll(CITE)) {
    markdownNodes(clean.slice(last, m.index), out);
    const hit = byKey.get(m[1]);
    // An unresolved key is the model's slip, not data — show it quietly
    // rather than as a broken-looking bracket.
    out.push(hit ? { kind: "cite", e: hit } : { kind: "dead", text: m[1] });
    last = m.index + m[0].length;
  }
  markdownNodes(clean.slice(last), out);
  return out;
}

/* ── blocks ───────────────────────────────────────────────────────────
 * The model reaches for a markdown table whenever it compares two
 * accounts, and a table flattened into a paragraph is a wall of pipes.
 * Text is split into prose and table blocks so each renders as itself. */

type Block =
  | { kind: "prose"; nodes: Node[] }
  | { kind: "table"; head: Node[][] | null; rows: Node[][][]; align: ("l" | "r")[] };

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l: string) => /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(l);
const cellsOf = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
/** Numeric-ish columns read better right-aligned and in tabular figures. */
const numeric = (c: string) => /^[−\-+]?[$€£]?[\d,.]+\s*(%|d|days|\/mo)?$/.test(c.replace(/\*/g, "").trim());

function useBlocks(text: string, evidence: Evidence[]): Block[] {
  return useMemo(() => {
    const byKey = new Map(evidence.map((e) => [e.key, e]));
    const blocks: Block[] = [];
    let prose: string[] = [];
    let table: string[] = [];

    const flushProse = () => {
      const body = prose.join("\n").replace(/^\n+|\n+$/g, "");
      prose = [];
      if (body) blocks.push({ kind: "prose", nodes: nodesFor(body, byKey) });
    };
    const flushTable = () => {
      if (!table.length) return;
      if (table.length < 2) { prose.push(...table); table = []; return; }
      let head: string[] | null = null;
      let body = table;
      if (isSep(table[1])) { head = cellsOf(table[0]); body = table.slice(2); }
      const grid = body.map(cellsOf).filter((r) => r.some(Boolean));
      table = [];
      if (!grid.length) { if (head) prose.push(head.join(" · ")); return; }
      flushProse();
      const width = Math.max(head?.length ?? 0, ...grid.map((r) => r.length));
      const align: ("l" | "r")[] = [];
      for (let c = 0; c < width; c++) {
        const col = grid.map((r) => r[c] ?? "").filter(Boolean);
        align.push(col.length && col.every(numeric) ? "r" : "l");
      }
      blocks.push({
        kind: "table",
        head: head ? head.map((c) => nodesFor(c, byKey)) : null,
        rows: grid.map((r) => r.map((c) => nodesFor(c, byKey))),
        align,
      });
    };

    for (const line of text.split("\n")) {
      if (isRow(line)) table.push(line);
      else { flushTable(); prose.push(line); }
    }
    flushTable();
    flushProse();
    return blocks;
  }, [text, evidence]);
}

function Inline({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case "cite": return <Chip key={i} e={n.e} />;
          case "b": return <strong key={i} className="font-semibold">{n.text}</strong>;
          case "i": return <em key={i}>{n.text}</em>;
          case "c": return <code key={i} className="rounded-[4px] bg-inset px-1 font-mono text-[11.5px] text-ink-2">{n.text}</code>;
          case "dead": return <span key={i} className="font-mono text-[11px] text-ink-3">{n.text}</span>;
          default: return n.text;
        }
      })}
    </>
  );
}

function Table({ b }: { b: Extract<Block, { kind: "table" }> }) {
  return (
    <div className="-mx-0.5 my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        {b.head && (
          <thead>
            <tr>
              {b.head.map((c, i) => (
                <th key={i}
                  className={cn(
                    "border-b border-line px-2 py-1.5 text-[10.5px] font-medium tracking-[0.04em] text-ink-3 uppercase",
                    b.align[i] === "r" ? "text-right" : "text-left",
                  )}>
                  <Inline nodes={c} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {b.rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line last:border-0">
              {r.map((c, ci) => (
                <td key={ci}
                  className={cn(
                    "px-2 py-1.5 align-top text-ink-2",
                    b.align[ci] === "r" ? "text-right font-mono tabular-nums" : "text-left",
                    ci === 0 && "font-medium text-ink",
                  )}>
                  <Inline nodes={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chip({ e }: { e: Evidence }) {
  const label = e.source === "usage" ? "telemetry" : e.source;
  const cls =
    "mx-[1px] inline-flex h-[17px] translate-y-[2px] items-center gap-1 rounded-[5px] bg-inset px-[3px] align-baseline font-mono text-[10px] leading-none text-ink-2 shadow-hairline transition-colors duration-150 hover:bg-hover hover:text-ink";
  const body = (
    <>
      <BrandMark id={e.source} size={11} />
      {label}
    </>
  );
  return e.url ? (
    <a href={e.url} target="_blank" rel="noreferrer" title={`${e.label} — ${e.detail}`} className={cls}>{body}</a>
  ) : (
    <span title={`${e.label} — ${e.detail}`} className={cls}>{body}</span>
  );
}

export default function AgentProse({
  text, evidence, live, cited,
}: {
  text: string;
  evidence: Evidence[];
  live: boolean;
  cited?: boolean;
}) {
  /* Trailing whitespace — the \n\n we emit between reasoning steps — would
     park the caret on an empty line below the last sentence while the model
     runs a tool. It looks stalled. Strip it for render only; the break returns
     the instant the next chunk makes it interior. */
  const shown = live ? text.replace(/\s+$/, "") : text;
  const typing = useTyping(text, live);
  const blocks = useBlocks(shown, evidence);
  const [open, setOpen] = useState(false);
  const used = useMemo(() => {
    const keys = new Set([...text.matchAll(CITE)].map((m) => m[1]));
    return evidence.filter((e) => keys.has(e.key));
  }, [text, evidence]);

  if (!text && !live) return null;

  const caret = live && (
    <span
      aria-hidden
      className="ml-[3px] inline-block h-[1.05em] w-[2px] translate-y-[0.18em] rounded-full bg-accent align-baseline"
      style={typing ? undefined : { animation: "caret 1.2s ease-in-out infinite" }}
    />
  );

  return (
    <div>
      {blocks.length === 0 && live && <p className="text-[13.5px] leading-[1.65] text-ink">{caret}</p>}
      {blocks.map((b, i) =>
        b.kind === "table" ? (
          <Table key={i} b={b} />
        ) : (
          <p key={i} className="text-[13.5px] leading-[1.65] whitespace-pre-wrap text-ink">
            <Inline nodes={b.nodes} />
            {i === blocks.length - 1 && caret}
          </p>
        ),
      )}

      {cited && used.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="-ml-1 mt-2 flex items-center gap-1.5 rounded-[7px] px-1 py-0.5 transition-colors duration-150 hover:bg-hover">
            <span className="flex -space-x-1">
              {used.slice(0, 4).map((e) => (
                <span key={e.key} className="flex size-[15px] items-center justify-center rounded-full bg-surface shadow-[0_0_0_1.5px_var(--canvas)]">
                  <BrandMark id={e.source} size={10} />
                </span>
              ))}
            </span>
            <span className="text-[11.5px] text-ink-2">{used.length} source{used.length === 1 ? "" : "s"}</span>
            <span className="text-ink-3 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }}>
              <Glyph d={PATHS.chevron} size={11} strokeWidth={2.4} />
            </span>
          </button>

          <div className="grid transition-[grid-template-rows,opacity] duration-300"
            style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}>
            <div className="overflow-hidden">
              <div className="mt-1.5 flex flex-col rounded-[10px] bg-surface p-1 shadow-hairline">
                {used.map((e) => {
                  const Row = e.url ? "a" : "div";
                  return (
                    <Row key={e.key} {...(e.url ? { href: e.url, target: "_blank", rel: "noreferrer" } : {})}
                      className={cn("flex items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-[12px] transition-colors duration-150", e.url && "hover:bg-hover")}>
                      <span className="mt-px shrink-0"><BrandMark id={e.source} size={14} /></span>
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
