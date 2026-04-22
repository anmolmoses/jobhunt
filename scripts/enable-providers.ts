/**
 * enable-providers.ts
 *
 * One-off (but reusable) script to union additional provider names into the
 * `search_enabled_providers` setting. Defaults to adding "firecrawl" and
 * "greenhouse" — both previously excluded even though their provider classes
 * return results. Safe to re-run: uses set-union semantics.
 *
 * Run:
 *   npx tsx scripts/enable-providers.ts
 *   npx tsx scripts/enable-providers.ts firecrawl greenhouse foo
 *
 * Needs ENCRYPTION_SECRET in env (read from .env.local).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local manually
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";
import { setSetting } from "../src/lib/settings";

const DEFAULT_ADDITIONS = ["firecrawl", "greenhouse"];

function main() {
  const additions = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : DEFAULT_ADDITIONS;

  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "search_enabled_providers"))
    .get();

  let current: string[] = [];
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) current = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      console.warn("Existing value is not valid JSON; starting from empty array.");
    }
  }

  console.log("Before:", JSON.stringify(current));

  const merged = Array.from(new Set([...current, ...additions]));
  setSetting("search_enabled_providers", JSON.stringify(merged));

  console.log("After: ", JSON.stringify(merged));
  console.log("Added: ", additions.filter((a) => !current.includes(a)));
}

main();
