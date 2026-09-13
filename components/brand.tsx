/* Keel's mark — vectorised from the original artwork, so it stays crisp at any
 * size and takes its colour from `currentColor` (the black-background export
 * would have been a white rectangle in light mode). Swap this one file to
 * change the logo everywhere. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={(size * 80.5700) / 100.0000}
      height={size}
      viewBox="0 0 80.57 100.00"
      fill="currentColor"
      aria-hidden="true"
    >
      <path fillRule="evenodd" clipRule="evenodd" d="M4.15 81.18L3.44 81.10L2.73 80.67L2.26 80.16L1.94 79.35L1.93 61.13L2.23 57.47L3.10 53.24L4.25 49.84L5.09 47.98L6.32 45.65L7.55 43.72L10.32 40.21L12.29 38.26L14.10 36.74L17.23 34.62L20.65 32.81L39.47 22.07L75.81 1.89L77.23 1.78L78.18 2.33L78.62 2.94L78.79 3.95L78.79 23.48L78.58 27.53L78.23 29.66L77.36 32.79L76.21 35.73L75.00 38.16L74.11 39.57L71.54 42.91L69.33 45.06L66.80 47.01L64.78 48.27L57.09 52.44L54.05 54.36L50.69 56.07L39.88 62.09L34.11 65.02L6.48 80.25L4.87 81.07L4.15 81.18ZM44.23 98.59L13.56 98.53L12.25 98.07L11.14 97.27L9.91 95.65L9.42 93.72L9.38 92.61L9.58 91.40L10.40 89.57L11.13 88.61L11.67 88.16L12.45 87.59L19.74 83.47L21.57 82.29L24.18 80.26L28.53 76.21L30.87 73.74L32.79 71.37L34.11 69.99L34.31 69.89L34.41 70.29L34.46 69.84L34.92 69.80L35.20 69.43L35.73 69.15L36.03 68.65L37.10 68.02L37.96 67.59L38.77 67.39L39.17 67.03L39.68 67.08L41.70 66.04L43.12 65.11L43.72 64.90L44.28 64.47L44.94 64.22L45.14 63.94L47.17 63.08L49.70 61.11L51.42 60.15L52.23 59.44L53.34 58.83L54.55 57.74L55.57 57.41L55.87 56.97L56.96 56.68L57.06 56.28L56.88 56.12L56.87 55.87L57.09 55.79L57.29 56.02L57.49 56.02L57.54 55.77L57.97 55.47L57.78 55.26L58.00 55.07L59.32 55.77L60.39 56.58L62.39 58.60L63.16 59.59L63.66 60.30L64.81 62.55L66.03 65.69L66.83 68.72L67.12 70.75L67.21 72.67L67.18 75.00L66.89 77.73L66.07 80.97L64.75 84.31L62.45 88.22L60.02 91.17L57.29 93.58L54.25 95.61L50.81 97.23L48.18 98.08L46.26 98.44L44.23 98.59Z" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center justify-center text-ink">
        <Mark size={19} />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.03em] text-ink">keel</span>
    </span>
  );
}
