/* Keel's mark: a hull section with the keel line running beneath it — the
 * structural member that keeps a vessel upright and stops it capsizing.
 * Swap this one file to change the logo everywhere. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* hull */}
      <path d="M3.4 9.6h17.2l-2.3 6.1a5 5 0 0 1-4.7 3.2h-3.2a5 5 0 0 1-4.7-3.2L3.4 9.6Z"
        fill="currentColor" opacity="0.16" />
      <path d="M3.4 9.6h17.2l-2.3 6.1a5 5 0 0 1-4.7 3.2h-3.2a5 5 0 0 1-4.7-3.2L3.4 9.6Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* mast */}
      <path d="M12 9.6V4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* the keel itself */}
      <path d="M12 18.9v2.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-[26px] items-center justify-center rounded-[8px] bg-ink text-surface">
        <Mark size={16} />
      </span>
      <span className="text-[14px] font-semibold tracking-[-0.015em] text-ink">Keel</span>
    </span>
  );
}
