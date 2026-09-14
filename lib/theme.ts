/**
 * Theme switching, without the smear.
 *
 * Flipping the theme changes color, background-color, border-color and
 * box-shadow on nearly every element at once. Everything carrying a transition
 * on those properties then animates together, so the switch reads as a slow
 * wipe across the page instead of an instant change.
 *
 * The fix is to turn every transition off for exactly one frame: inject an
 * override, force a synchronous style flush so the new colours resolve while it
 * still applies, then drop it on the next frame so the next interaction still
 * animates normally.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "keel-theme";

/** Reads the value the layout script committed before first paint. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(next: Theme) {
  const style = document.createElement("style");
  style.append(document.createTextNode("*,*::before,*::after{transition:none !important}"));
  document.head.append(style);

  document.documentElement.setAttribute("data-theme", next);

  /* Read a layout property for its side effect: it forces the browser to
     resolve the new colours now, while the override is still in the document,
     so no transition is ever started. */
  void document.body.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => style.remove());
  });

  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
}
