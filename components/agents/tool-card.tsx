/* Adapted from starc007/ui-components (MIT, (c) 2026 Saurabh Chauhan)
 * https://github.com/starc007/ui-components — the ToolResult disclosure
 * pattern, retokenised onto Keel's palette and bound to connector reads
 * rather than shell output. */
"use client";

import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { AgentDisclosure } from "./agent-disclosure";
import { SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";

export type ToolStatus = "running" | "success" | "error";

function StatusIcon({ status, reduce }: { status: ToolStatus; reduce: boolean }) {
  if (status === "running") return <LoaderCircle className={cn("size-3", !reduce && "animate-spin")} />;
  if (status === "success") return <CircleCheck className="size-3" />;
  return <CircleX className="size-3" />;
}

function statusClass(status: ToolStatus) {
  if (status === "running") return "text-accent-ink";
  if (status === "success") return "text-green";
  return "text-red";
}

export interface ToolCardProps {
  /** The tool that ran, in mono. */
  tool: string;
  /** What it was asked about. */
  title?: ReactNode;
  /** A short result headline, e.g. "risk 92/100". */
  meta?: ReactNode;
  status?: ToolStatus;
  icon?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  collapseOnComplete?: boolean;
  maxHeight?: number;
  className?: string;
}

export function ToolCard({
  tool, title, meta, status = "running", icon, children,
  defaultOpen = true, collapseOnComplete = true, maxHeight = 200, className,
}: ToolCardProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const triggerId = `${baseId}-t`;
  const contentId = `${baseId}-c`;
  const previous = useRef(status);
  const [open, setOpen] = useState(defaultOpen && Boolean(children));

  // Opens itself when work starts and folds away when it finishes, so a long
  // run does not accumulate noise.
  useEffect(() => {
    if (previous.current !== "running" && status === "running" && children) setOpen(true);
    if (previous.current === "running" && status !== "running" && collapseOnComplete) setOpen(false);
    previous.current = status;
  }, [status, collapseOnComplete, children]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const hasBody = Boolean(children);

  return (
    <div className={cn("overflow-hidden rounded-[10px] bg-surface shadow-card", className)}>
      <button
        type="button" id={triggerId} aria-controls={hasBody ? contentId : undefined}
        aria-expanded={hasBody ? open : undefined} onClick={hasBody ? toggle : undefined}
        disabled={!hasBody}
        className={cn("flex w-full items-center gap-2 px-2.5 py-[7px] text-left transition-colors duration-150",
          hasBody && "hover:bg-hover-2")}
      >
        <span className={cn("flex size-4 shrink-0 items-center justify-center", statusClass(status))}>
          <StatusIcon status={status} reduce={reduce} />
        </span>
        {icon && <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>}
        <span className="shrink-0 font-mono text-[11.5px] text-ink">{tool}</span>
        {title && <span className="min-w-0 truncate text-[12px] text-ink-2">{title}</span>}
        {meta && <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">{meta}</span>}
        {hasBody && (
          <motion.span
            aria-hidden className={cn("shrink-0 text-ink-3", !meta && "ml-auto")}
            animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : SPRING_PRESS}
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        )}
      </button>

      {hasBody && (
        <AgentDisclosure open={open} id={contentId} role="region" aria-labelledby={triggerId}>
          <div className="scroll-slim overflow-y-auto border-t border-line px-2.5 py-2" style={{ maxHeight }}>
            {children}
          </div>
        </AgentDisclosure>
      )}
    </div>
  );
}

/** A stack of tool cards — the agent's read log for one turn. */
export function ToolLog({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}
