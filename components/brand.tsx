/* Backstop's mark: a shield whose lower half is a caught, rising line —
 * the save. Drawn with currentColor so it inherits wherever it is placed.
 * Swap this one file to change the logo everywhere. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.4 4.6 5.2v6.2c0 4.6 3.1 8.4 7.4 10.2 4.3-1.8 7.4-5.6 7.4-10.2V5.2L12 2.4Z"
        fill="currentColor" opacity="0.14"
      />
      <path
        d="M12 2.4 4.6 5.2v6.2c0 4.6 3.1 8.4 7.4 10.2 4.3-1.8 7.4-5.6 7.4-10.2V5.2L12 2.4Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      {/* the falling line, caught */}
      <path
        d="M7.6 10.2 10 13l1.9-1.7 3.4 4.1"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-[26px] items-center justify-center rounded-[8px] bg-ink text-surface">
        <Mark size={16} />
      </span>
      <span className="text-[14px] font-semibold tracking-[-0.015em] text-ink">Backstop</span>
    </span>
  );
}
