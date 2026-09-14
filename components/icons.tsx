/**
 * Connector marks and UI glyphs, inline so the app has no icon dependency.
 *
 * Stroke is derived from size, never passed in.
 *
 * Every glyph draws in a fixed 24-unit viewBox and renders at `size` px, so a
 * literal strokeWidth means a different weight on screen at every size: the app
 * had 27 icons spread across fourteen values from 0.82px to 1.5px, a 1.8x
 * range. An icon set reads as one set only when the on-screen weight is
 * constant, so that is the number held fixed here and the SVG value is solved
 * backwards from it.
 *
 * `weight` is the one deliberate exception: "strong" sits beside semibold text
 * or carries state (a verified tick), where a hairline looks broken next to the
 * heavier type.
 */
const VISUAL_STROKE = { regular: 1.25, strong: 1.6 } as const;

export function Glyph({
  d,
  size = 15,
  weight = "regular",
  children,
}: {
  d?: string;
  size?: number;
  weight?: keyof typeof VISUAL_STROKE;
  children?: React.ReactNode;
}) {
  /* Solve for the viewBox value that lands on the target painted width. */
  const strokeWidth = (VISUAL_STROKE[weight] / size) * 24;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const PATHS = {
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  retry: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4",
  bolt: "M13 2L3 14h8l-1 8 10-12h-8l1-8z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  chevron: "M6 9l6 6 6-6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  mail: "M4 4h16v16H4zM4 6l8 6 8-6",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  pause: "M10 4H6v16h4zM18 4h-4v16h4z",
};

import { BRANDS } from "./brand-marks";

/**
 * A connector mark on a neutral tile. The glyph wears its own brand colour where
 * the brand has one; black-marked brands (Notion, Resend) follow the interface
 * ink so they survive dark mode.
 */
export function BrandMark({ id, size = 16 }: { id: string; size?: number }) {
  if (id === "slack") return <SlackMark size={size} />;
  if (id === "usage" || id === "telemetry") return <TelemetryMark size={size} />;
  const b = BRANDS[id];
  if (!b) return <TelemetryMark size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={b.title}>
      <title>{b.title}</title>
      <path d={b.path} fill={b.color ?? "var(--ink)"} />
    </svg>
  );
}

/** Slack's official mark — not carried by simple-icons. */
function SlackMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" role="img" aria-label="Slack">
      <title>Slack</title>
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
      <path d="M47 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.7 39.7.8 47 .8c7.3 0 13.2 5.9 13.2 13.2v13.2H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.3.7 54.4.7 47.1c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" />
      <path d="M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2v33.2z" fill="#2EB67D" />
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" />
    </svg>
  );
}

/** First-party product telemetry has no vendor, so it gets a neutral mark. */
function TelemetryMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Product telemetry">
      <title>Product telemetry</title>
      <path d="M4 20V13M9.3 20V8M14.7 20v-5M20 20V4" stroke="var(--ink-2)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Back-compat for call sites that render marks from a map. */
export const CONNECTOR_MARKS: Record<string, React.ReactNode> = new Proxy(
  {},
  { get: (_t, id: string) => (typeof id === "string" ? <BrandMark id={id} /> : null) },
) as Record<string, React.ReactNode>;
