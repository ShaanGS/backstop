"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Glyph, PATHS } from "./icons";
import { cn, money } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * COMPOSER
 * The operator's input. `@` mentions a real account, `/` runs
 * a command. ↑↓ moves, Enter picks, Enter sends.
 * ───────────────────────────────────────────────────────── */

export type MentionAccount = { id: string; name: string; mrrCents: number; riskScore: number; tags: string[] };
export type Command = { name: string; desc: string; run: string };

export const COMMANDS: Command[] = [
  { name: "/rescue", desc: "Find the account most at risk and run the save play", run: "rescue" },
  { name: "/investigate", desc: "Investigate one account without proposing actions", run: "investigate" },
  { name: "/audit", desc: "Show the append-only audit log for the last run", run: "audit" },
  { name: "/evals", desc: "Open the reliability scorecard", run: "evals" },
];

function parseToken(draft: string) {
  const m = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!m) return null;
  return { kind: m[2] === "@" ? ("at" as const) : ("slash" as const), query: m[3].toLowerCase(), start: m.index + m[1].length };
}

export default function Composer({
  accounts, busy, onSubmit, placeholder = "Ask the agent, or type / for commands",
}: {
  accounts: MentionAccount[];
  busy: boolean;
  onSubmit: (text: string, mentioned?: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const token = dismissed ? null : parseToken(draft);
  const menu = menuOpen ? "at" : (token?.kind ?? null);
  const query = menuOpen ? "" : (token?.query ?? "");

  const rows =
    menu === "at"
      ? accounts.filter((a) => a.name.toLowerCase().includes(query)).map((a) => ({ key: a.id, name: a.name, desc: `${money(a.mrrCents)}/mo · risk ${a.riskScore}`, account: a }))
      : menu === "slash"
        ? COMMANDS.filter((c) => c.name.slice(1).startsWith(query)).map((c) => ({ key: c.name, name: c.name, desc: c.desc, account: undefined }))
        : [];

  // Resetting the highlight when the menu changes is the point; the extra
  // render is one frame and never user-visible.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setActive(0); setEngaged(false); }, [menu, query]);

  // A single highlight glides between rows instead of each row toggling.
  useLayoutEffect(() => {
    const el = rowRefs.current[active];
    if (el) setBox({ top: el.offsetTop, height: el.offsetHeight });
  }, [menu, query, active, rows.length]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 120)}px`;
  }, [draft]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-composer]")) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  function pick(row: (typeof rows)[number]) {
    const head = token ? draft.slice(0, token.start) : draft;
    setDraft(menu === "at" ? `${head}@${row.name} ` : `${head}${row.name} `);
    setMenuOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  }

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const mentioned = accounts.find((a) => text.includes(`@${a.name}`))?.id;
    onSubmit(text, mentioned);
    setDraft("");
    setMenuOpen(false);
  }

  const canSend = draft.trim().length > 0 && !busy;

  return (
    <div data-composer className="relative">
      {menu && (
        <div onMouseLeave={() => setEngaged(false)}
          className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-[12px] bg-surface p-1 shadow-raised"
          style={{ animation: "pop-in 170ms var(--ease-out) both", transformOrigin: "bottom center" }}>
          <span aria-hidden className="pointer-events-none absolute inset-x-1 rounded-[7px] bg-hover"
            style={{
              top: box?.top ?? 0, height: box?.height ?? 0,
              opacity: box && engaged && rows.length ? 1 : 0,
              transition: "top 200ms var(--ease-out), height 200ms var(--ease-out), opacity 140ms ease",
            }} />
          {rows.map((row, i) => (
            <button key={row.key} type="button"
              ref={(el) => { rowRefs.current[i] = el; }}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => { setActive(i); setEngaged(true); }}
              onClick={() => pick(row)}
              className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[7px] px-2 text-left">
              {row.account ? (
                <span className={cn("size-1.5 shrink-0 rounded-full",
                  row.account.riskScore >= 70 ? "bg-red" : row.account.riskScore >= 40 ? "bg-amber" : "bg-green")} />
              ) : (
                <span className="flex size-4 shrink-0 items-center justify-center text-ink-3">
                  <Glyph d={PATHS.bolt} size={12} />
                </span>
              )}
              <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.name}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{row.desc}</span>
              {row.account?.tags.includes("do-not-contact") && (
                <span className="shrink-0 rounded-full bg-red-tint px-1.5 font-mono text-[9.5px] text-red">do-not-contact</span>
              )}
            </button>
          ))}
          {!rows.length && <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">No matches for “{query}”</div>}
          <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[10.5px] text-ink-3">
            {menu === "at" ? "↑↓ to move · Enter to insert an account" : "↑↓ to move · Enter to insert a command"}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-[16px] border border-line bg-surface p-1.5 shadow-card transition-colors duration-150 focus-within:border-line-strong">
        <textarea
          ref={inputRef} rows={1} value={draft} disabled={busy}
          onChange={(e) => { setDraft(e.target.value); setDismissed(false); setMenuOpen(false); }}
          onKeyDown={(e) => {
            if (menu && rows.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault(); setEngaged(true);
                setActive((c) => (c + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
                return;
              }
              if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") { e.preventDefault(); pick(rows[active]); return; }
            }
            if (e.key === "Escape") { setDismissed(true); setMenuOpen(false); return; }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          placeholder={busy ? "Agent is working…" : placeholder}
          aria-label="Message the agent"
          className="min-h-6 w-full resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-6 text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 disabled:opacity-60"
        />
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Mention an account" aria-expanded={menuOpen} disabled={busy}
            onClick={() => { setMenuOpen((o) => !o); inputRef.current?.focus(); }}
            className={cn("flex size-7 shrink-0 items-center justify-center rounded-[10px] text-ink-3 press transition-[background-color,color] duration-150 hover:bg-hover hover:text-ink disabled:opacity-40",
              menuOpen && "bg-hover text-ink")}>
            <Glyph d="M12 5v14M5 12h14" size={16} strokeWidth={2} />
          </button>
          <span className="ml-auto hidden items-center gap-1 font-mono text-[10px] text-ink-3 sm:flex">
            <kbd className="rounded-[4px] bg-inset px-1 py-px shadow-hairline">@</kbd> account
            <kbd className="ml-1 rounded-[4px] bg-inset px-1 py-px shadow-hairline">/</kbd> command
          </span>
          <button type="button" aria-label="Send" disabled={!canSend} onClick={send}
            className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-[10px] press transition-[background-color,color] duration-150"
            style={{ background: canSend ? "var(--ink)" : "var(--line-strong)", color: canSend ? "var(--surface)" : "var(--ink-2)" }}>
            <Glyph d="M12 19V5M5 12l7-7 7 7" size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}
