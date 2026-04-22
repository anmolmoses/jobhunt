/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * diagnose-providers.ts
 *
 * Runs each production job-search provider in isolation against a fixed query
 * and writes a markdown report summarising health (configured?, results, error).
 *
 * Run:
 *   cd /Users/anmolmoses/work/personal/jobhunt
 *   npx tsx scripts/diagnose-providers.ts
 *
 * Needs ENCRYPTION_SECRET in env (read from .env.local).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ── Load .env.local manually (no dotenv dep required) ──
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

// ── Now import providers (must be after env load — settings layer relies on DB + env) ──
import { JSearchProvider } from "../src/lib/jobs/jsearch";
import { AdzunaProvider } from "../src/lib/jobs/adzuna";
import { RemotiveProvider } from "../src/lib/jobs/remotive";
import { LinkedInProvider } from "../src/lib/jobs/linkedin";
import { IndeedProvider } from "../src/lib/jobs/indeed";
import { RemoteOKProvider } from "../src/lib/jobs/remoteok";
import { JobicyProvider } from "../src/lib/jobs/jobicy";
import { HackerNewsProvider } from "../src/lib/jobs/hackernews";
import { FirecrawlSearchProvider } from "../src/lib/jobs/firecrawl-search";
import { GreenhouseProvider } from "../src/lib/jobs/greenhouse";

import type { JobSearchParams, JobSearchProvider, NormalizedJob } from "../src/types/jobs";

const providers: JobSearchProvider[] = [
  new JSearchProvider(),
  new AdzunaProvider(),
  new RemotiveProvider(),
  new LinkedInProvider(),
  new IndeedProvider(),
  new RemoteOKProvider(),
  new JobicyProvider(),
  new HackerNewsProvider(),
  new FirecrawlSearchProvider(),
  new GreenhouseProvider(),
];

const params: JobSearchParams = {
  query: "senior software engineer",
  location: "remote",
  datePosted: "7d",
  resultsPerPage: 10,
};

interface ProviderReport {
  name: string;
  configured: boolean;
  elapsedMs: number;
  count: number;
  error: string | null;
  stack: string | null;
  sample: { title: string; company: string; location: string | null }[];
}

async function runOne(p: JobSearchProvider): Promise<ProviderReport> {
  const name = p.name;
  let configured = false;
  try {
    configured = await p.isConfigured();
  } catch (e: any) {
    return {
      name,
      configured: false,
      elapsedMs: 0,
      count: 0,
      error: `isConfigured() threw: ${e?.message || String(e)}`,
      stack: e?.stack || null,
      sample: [],
    };
  }

  if (!configured) {
    return {
      name,
      configured: false,
      elapsedMs: 0,
      count: 0,
      error: null,
      stack: null,
      sample: [],
    };
  }

  const start = Date.now();
  try {
    // Give slow providers (scrapers, firecrawl) a hard ceiling so one hang doesn't block the whole report.
    const jobs: NormalizedJob[] = await Promise.race([
      p.search(params),
      new Promise<NormalizedJob[]>((_, reject) =>
        setTimeout(() => reject(new Error("provider timeout after 90s")), 90_000)
      ),
    ]);
    const elapsedMs = Date.now() - start;
    return {
      name,
      configured: true,
      elapsedMs,
      count: jobs.length,
      error: null,
      stack: null,
      sample: jobs.slice(0, 3).map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
      })),
    };
  } catch (e: any) {
    const elapsedMs = Date.now() - start;
    return {
      name,
      configured: true,
      elapsedMs,
      count: 0,
      error: e?.message || String(e),
      stack: e?.stack || null,
      sample: [],
    };
  }
}

function renderMarkdown(reports: ProviderReport[]): string {
  const now = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Job Provider Diagnostic`);
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push(`Query: \`${params.query}\` | Location: \`${params.location}\` | Date: \`${params.datePosted}\` | Per-page: \`${params.resultsPerPage}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Provider | Configured | Results | Elapsed | Status |");
  lines.push("|---|---|---|---|---|");
  for (const r of reports) {
    const status = !r.configured
      ? "Not configured"
      : r.error
      ? `ERROR: ${r.error.slice(0, 80)}`
      : r.count > 0
      ? "OK"
      : "Zero results";
    lines.push(
      `| ${r.name} | ${r.configured ? "yes" : "no"} | ${r.count} | ${r.elapsedMs}ms | ${status} |`
    );
  }
  lines.push("");

  lines.push("## Detail");
  lines.push("");
  for (const r of reports) {
    lines.push(`### ${r.name}`);
    lines.push("");
    lines.push(`- Configured: **${r.configured}**`);
    lines.push(`- Elapsed: ${r.elapsedMs}ms`);
    lines.push(`- Results returned: **${r.count}**`);
    if (r.error) {
      lines.push(`- Error: \`${r.error}\``);
      if (r.stack) {
        lines.push("");
        lines.push("<details><summary>Stack</summary>");
        lines.push("");
        lines.push("```");
        lines.push(r.stack.split("\n").slice(0, 12).join("\n"));
        lines.push("```");
        lines.push("");
        lines.push("</details>");
      }
    }
    if (r.sample.length > 0) {
      lines.push("");
      lines.push("Sample jobs:");
      for (const s of r.sample) {
        lines.push(`  - ${s.title} @ ${s.company} (${s.location || "—"})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  console.log(`Running ${providers.length} providers against:`, params);
  console.log("");

  const reports: ProviderReport[] = [];
  // Sequential so we see progress and don't have 10 scrapers fighting for CPU.
  for (const p of providers) {
    process.stdout.write(`• ${p.name.padEnd(12)} … `);
    const r = await runOne(p);
    reports.push(r);
    if (!r.configured) {
      console.log("not configured");
    } else if (r.error) {
      console.log(`FAIL (${r.elapsedMs}ms): ${r.error}`);
    } else {
      console.log(`${r.count} jobs in ${r.elapsedMs}ms`);
    }
  }

  // Print summary table
  console.log("");
  console.log("Summary:");
  console.log("Provider     | Configured | Results | Elapsed | Status");
  console.log("-------------+------------+---------+---------+--------------");
  for (const r of reports) {
    const status = !r.configured
      ? "not configured"
      : r.error
      ? `ERR: ${r.error.slice(0, 40)}`
      : r.count > 0
      ? "OK"
      : "zero";
    console.log(
      `${r.name.padEnd(12)} | ${String(r.configured).padEnd(10)} | ${String(r.count).padEnd(7)} | ${(r.elapsedMs + "ms").padEnd(7)} | ${status}`
    );
  }

  const md = renderMarkdown(reports);
  const outPath = resolve(process.cwd(), "docs/provider-diagnostic.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, "utf8");
  console.log("");
  console.log(`Report written to ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
