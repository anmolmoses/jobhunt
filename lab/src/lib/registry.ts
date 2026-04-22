import type { JobSearchProvider } from "@app/types/jobs";

import { JSearchProvider } from "@app/lib/jobs/jsearch";
import { AdzunaProvider } from "@app/lib/jobs/adzuna";
import { RemotiveProvider } from "@app/lib/jobs/remotive";
import { LinkedInProvider } from "@app/lib/jobs/linkedin";
import { IndeedProvider } from "@app/lib/jobs/indeed";
import { RemoteOKProvider } from "@app/lib/jobs/remoteok";
import { JobicyProvider } from "@app/lib/jobs/jobicy";
import { HackerNewsProvider } from "@app/lib/jobs/hackernews";
import { FirecrawlSearchProvider } from "@app/lib/jobs/firecrawl-search";
import { GreenhouseProvider } from "@app/lib/jobs/greenhouse";

// Production providers — statically imported so bundling is reliable.
export const currentProviders: JobSearchProvider[] = [
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

// Experimental providers land in `src/lib/jobs/experimental/*.ts` as other agents
// ship them. Each import is wrapped in try/catch so a missing file silently no-ops.
//
// Conventions: file name matches the slug below, and it exports ONE of:
//   - a default export that is a JobSearchProvider class or instance
//   - a named export `Provider` / `default`
//   - a named export that ends with `Provider` (e.g. WellfoundProvider)
//
// Explicit loader map — template-literal dynamic imports aren't reliably
// statically analyzable by webpack/turbopack, so list each one out.
const EXPERIMENTAL_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  "claude-code": () => import("@app/lib/jobs/experimental/claude-code"),
  "linkedin-public": () => import("@app/lib/jobs/experimental/linkedin-public"),
  "ycombinator": () => import("@app/lib/jobs/experimental/ycombinator"),
  "lever": () => import("@app/lib/jobs/experimental/lever"),
  "ashby": () => import("@app/lib/jobs/experimental/ashby"),
  "workday": () => import("@app/lib/jobs/experimental/workday"),
};
const EXPERIMENTAL_SLUGS = Object.keys(EXPERIMENTAL_LOADERS);

function instantiate(maybeCtorOrInstance: unknown): JobSearchProvider | null {
  if (!maybeCtorOrInstance) return null;
  // If it's already an instance (has name + search + isConfigured), use it directly.
  if (
    typeof maybeCtorOrInstance === "object" &&
    maybeCtorOrInstance !== null &&
    "search" in maybeCtorOrInstance &&
    "isConfigured" in maybeCtorOrInstance
  ) {
    return maybeCtorOrInstance as JobSearchProvider;
  }
  // If it's a class constructor, new it up.
  if (typeof maybeCtorOrInstance === "function") {
    try {
      const instance = new (maybeCtorOrInstance as new () => JobSearchProvider)();
      if (instance && "search" in instance && "isConfigured" in instance) {
        return instance;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function pickProviderFromModule(mod: Record<string, unknown>): JobSearchProvider | null {
  // Try common export shapes in order.
  const candidates: unknown[] = [];
  if ("default" in mod) candidates.push(mod.default);
  if ("Provider" in mod) candidates.push(mod.Provider);
  if ("provider" in mod) candidates.push(mod.provider);
  for (const key of Object.keys(mod)) {
    if (key.endsWith("Provider")) candidates.push(mod[key]);
  }
  for (const c of candidates) {
    const instance = instantiate(c);
    if (instance) return instance;
  }
  return null;
}

export async function loadExperimentalProviders(): Promise<JobSearchProvider[]> {
  const out: JobSearchProvider[] = [];
  for (const slug of EXPERIMENTAL_SLUGS) {
    try {
      const mod = await EXPERIMENTAL_LOADERS[slug]();
      const provider = pickProviderFromModule(mod);
      if (provider) out.push(provider);
      else console.warn(`[registry] ${slug}: module loaded but no provider export found`);
    } catch (e) {
      console.warn(`[registry] ${slug}: import failed —`, (e as Error).message);
    }
  }
  return out;
}

export const EXPERIMENTAL_SLUG_LIST = EXPERIMENTAL_SLUGS as readonly string[];
