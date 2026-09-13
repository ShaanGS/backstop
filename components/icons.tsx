/** Connector marks and UI glyphs, inline so the app has no icon dependency. */
export function Glyph({
  d,
  size = 15,
  strokeWidth = 1.8,
  children,
}: {
  d?: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
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

const brand = (bg: string, inner: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill={bg} />
    {inner}
  </svg>
);

export const CONNECTOR_MARKS: Record<string, React.ReactNode> = {
  stripe: brand(
    "#635BFF",
    <path d="M16.9 13.4c0-.8.7-1.1 1.7-1.1 1.5 0 3.4.5 4.9 1.3V9.2c-1.6-.6-3.2-.9-4.9-.9-4 0-6.7 2.1-6.7 5.6 0 5.4 7.5 4.5 7.5 6.9 0 .9-.8 1.2-1.9 1.2-1.6 0-3.7-.7-5.4-1.6v4.5c1.8.8 3.7 1.1 5.4 1.1 4.1 0 7-2 7-5.6 0-5.8-7.6-4.8-7.6-7z" fill="#fff" />,
  ),
  linear: brand(
    "#5E6AD2",
    <g fill="#fff">
      <path d="M7 18.6a9.4 9.4 0 0 0 6.4 6.4L7 18.6zM6.2 15.2a11.6 11.6 0 0 0 10.6 10.6L6.2 15.2zM6.1 11.5a15.3 15.3 0 0 0 14.4 14.4L6.1 11.5z" />
      <path d="M7.3 8.1a16 16 0 1 1 16.6 16.6L7.3 8.1z" opacity=".85" />
    </g>,
  ),
  slack: brand(
    "#fff",
    <g transform="translate(6.5 6.5) scale(0.148)">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
      <path d="M47 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.7 39.7.8 47 .8c7.3 0 13.2 5.9 13.2 13.2v13.2H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.3.7 54.4.7 47.1c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" />
      <path d="M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2v33.2z" fill="#2EB67D" />
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" />
    </g>,
  ),
  notion: brand(
    "#fff",
    <g transform="translate(7 6)">
      <path d="M1.6 1.3 13.4.4c1.5-.1 1.8-.1 2.7.6l3.7 2.6c.6.5.8.6.8 1.1v14.4c0 .9-.3 1.4-1.5 1.5l-13.6.8c-.9 0-1.3-.1-1.8-.7L1 18.4c-.5-.7-.7-1.2-.7-1.8V2.4c0-.7.3-1 1.3-1.1z" fill="#000" />
      <path d="M13.4.4 1.6 1.3C.6 1.4.3 1.7.3 2.4v14.2c0 .6.2 1.1.7 1.8l2.7 3.1c.5.6.9.7 1.8.7l13.6-.8c1.2-.1 1.5-.6 1.5-1.5V4.7c0-.4-.2-.6-.7-1L16 1.1c-.9-.7-1.2-.7-2.6-.7zM5.7 4.4c-1.1.1-1.4.1-2-.4L2.2 2.9c-.2-.2-.1-.4.3-.4l11.3-.8c1 0 1.5.3 1.9.6l1.8 1.3c.1.1.4.4.1.4l-11.7.7-.2-.3zm-1.3 13V5.1c0-.5.2-.8.7-.8l12.1-.7c.5 0 .7.3.7.8v12.2c0 .5-.1.9-.8 1l-11.6.7c-.7 0-1.1-.2-1.1-.9z" fill="#fff" />
      <path d="M15.4 5.5c.1.4 0 .7-.4.8l-.6.1v8.2c-.5.3-1 .4-1.4.4-.6 0-.8-.2-1.3-.8L7.9 8.4v5.8l1.2.3s0 .7-1 .7l-2.6.2c-.1-.2 0-.6.3-.7l.6-.2V7.1l-.9-.1c-.1-.4.1-.9.7-1l2.7-.2 3.9 6V6.5l-1-.1c-.1-.5.3-.8.7-.9l2.6-.1z" fill="#000" />
    </g>,
  ),
  resend: brand(
    "#000",
    <path d="M9 8h7.4c3.3 0 5.6 2 5.6 5 0 2.2-1.2 3.8-3.1 4.6L22.8 24h-4.6l-3.3-5.7H13V24H9V8zm4 3.3v4.2h3.1c1.4 0 2.3-.8 2.3-2.1 0-1.3-.9-2.1-2.3-2.1H13z" fill="#fff" />,
  ),
  usage: brand("#0F172A", <path d="M8 21V12M14 21V7M20 21v-6M6 24h20" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />),
};
