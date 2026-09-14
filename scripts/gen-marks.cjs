/* eslint-disable @typescript-eslint/no-require-imports -- build script, CommonJS by design */
const si = require("simple-icons");
const fs = require("fs");
const path = require("path");

const brands = [
  ["stripe", "siStripe", "Stripe", "#635BFF"],
  ["linear", "siLinear", "Linear", "#5E6AD2"],
  ["notion", "siNotion", "Notion", null],   // black brand → follows ink
  ["resend", "siResend", "Resend", null],   // black brand → follows ink
];

const entries = brands.map(([key, siKey, title, color]) => {
  const icon = si[siKey];
  if (!icon) throw new Error("missing " + siKey);
  return `  ${key}: {
    title: "${title}",
    color: ${color ? JSON.stringify(color) : "null"},
    path: "${icon.path}",
  },`;
}).join("\n");

const out = `/**
 * Connector brand marks.
 *
 * Official paths, taken verbatim from simple-icons at build time (see
 * scripts/gen-marks.cjs) rather than redrawn by hand. Brands whose mark is
 * black carry \`color: null\` and follow the interface ink so they stay legible
 * in both themes. Slack is not in simple-icons — its official multi-colour
 * geometry is inlined below.
 */

export type BrandSpec = { title: string; color: string | null; path: string };

export const BRANDS: Record<string, BrandSpec> = {
${entries}
};
`;
fs.writeFileSync(path.join(__dirname, "..", "components", "brand-marks.ts"), out);
console.log("wrote components/brand-marks.ts");
