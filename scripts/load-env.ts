/** Loads .env.local then .env for scripts run outside the Next.js runtime. */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) config({ path, override: false, quiet: true });
}
