import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;


/**
 * One locale for every rendered date and time.
 *
 * `toLocaleDateString(undefined, …)` resolves to the *host's* locale, which is
 * the server's during SSR and the reader's in the browser. When those differ
 * the two passes emit different strings and React fails hydration (#418).
 * Pinning it makes the output deterministic on both sides.
 */
export const DATE_LOCALE = "en-GB";
