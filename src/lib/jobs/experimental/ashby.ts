import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

/**
 * Ashby public posting API:
 *   GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 * No auth required. Returns `{ jobs: [...] }` with rich metadata.
 */

// Verified-working slugs (curl-checked 200 OK with active jobs).
const SEED_COMPANIES: { slug: string; name: string }[] = [
  { slug: "openai", name: "OpenAI" },
  { slug: "ramp", name: "Ramp" },
  { slug: "linear", name: "Linear" },
  { slug: "vanta", name: "Vanta" },
  { slug: "posthog", name: "PostHog" },
  { slug: "plaid", name: "Plaid" },
  { slug: "warp", name: "Warp" },
  { slug: "perplexity", name: "Perplexity" },
  { slug: "writer", name: "Writer" },
  { slug: "notion", name: "Notion" },
  { slug: "runway", name: "Runway" },
  { slug: "attio", name: "Attio" },
  { slug: "arcade", name: "Arcade" },
  { slug: "watershed", name: "Watershed" },
  { slug: "replo", name: "Replo" },
  { slug: "deel", name: "Deel" },
  { slug: "benchling", name: "Benchling" },
  { slug: "persona", name: "Persona" },
  { slug: "prefect", name: "Prefect" },
  { slug: "scribe", name: "Scribe" },
  { slug: "statsig", name: "Statsig" },
  { slug: "supabase", name: "Supabase" },
  { slug: "unify", name: "Unify" },
  { slug: "zed", name: "Zed" },
  // AI / ML labs and applied AI
  { slug: "cursor", name: "Cursor" },
  { slug: "harvey", name: "Harvey" },
  { slug: "elevenlabs", name: "ElevenLabs" },
  { slug: "suno", name: "Suno" },
  { slug: "cohere", name: "Cohere" },
  { slug: "sierra", name: "Sierra" },
  { slug: "decagon", name: "Decagon" },
  { slug: "cognition", name: "Cognition" },
  { slug: "poolside", name: "Poolside" },
  { slug: "cartesia", name: "Cartesia" },
  { slug: "twelve-labs", name: "Twelve Labs" },
  { slug: "liquid-ai", name: "Liquid AI" },
  { slug: "deepgram", name: "Deepgram" },
  { slug: "mercor", name: "Mercor" },
  // Developer tools / AI infra
  { slug: "langchain", name: "LangChain" },
  { slug: "langfuse", name: "Langfuse" },
  { slug: "braintrust", name: "Braintrust" },
  { slug: "baseten", name: "Baseten" },
  { slug: "modal", name: "Modal" },
  { slug: "pinecone", name: "Pinecone" },
  { slug: "render", name: "Render" },
  { slug: "neon", name: "Neon" },
  { slug: "railway", name: "Railway" },
  { slug: "airbyte", name: "Airbyte" },
  { slug: "alchemy", name: "Alchemy" },
  { slug: "sanity", name: "Sanity" },
  { slug: "mintlify", name: "Mintlify" },
  { slug: "n8n", name: "n8n" },
  { slug: "workos", name: "WorkOS" },
  { slug: "stytch", name: "Stytch" },
  { slug: "resend", name: "Resend" },
  // Consumer / product AI
  { slug: "gamma", name: "Gamma" },
  { slug: "granola", name: "Granola" },
  { slug: "dust", name: "Dust" },
  { slug: "speak", name: "Speak" },
  { slug: "bland", name: "Bland" },
  { slug: "polymarket", name: "Polymarket" },
  { slug: "eightsleep", name: "Eight Sleep" },
  // Fintech / ops
  { slug: "moderntreasury", name: "Modern Treasury" },
];

const DATE_MAP: Record<string, number> = {
  "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
};

interface AshbyCompensationRange {
  min?: { value?: number; currencyCode?: string };
  max?: { value?: number; currencyCode?: string };
}

interface AshbyJob {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  secondaryLocations?: { location?: string }[];
  publishedAt?: string | null;
  updatedAt?: string | null;
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTierSummary?: string | null;
    summaryComponents?: { compensationType?: string; summary?: string }[];
  };
  compensationTierSummary?: string | null;
  address?: {
    postalAddress?: {
      addressRegion?: string;
      addressCountry?: string;
      addressLocality?: string;
    };
  };
}

interface AshbyResponse {
  apiVersion?: string;
  jobs?: AshbyJob[];
}

export class AshbyProvider implements JobSearchProvider {
  readonly name = "ashby" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const queryTerms = params.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    const locationTerms = (params.location || "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t.length > 2);

    const maxAgeDays = DATE_MAP[params.datePosted || "30d"] || 30;
    const dateCutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const results = await Promise.allSettled(
      SEED_COMPANIES.map((c) => this.fetchCompany(c))
    );

    const allJobs: NormalizedJob[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") allJobs.push(...r.value);
    }

    let filtered = allJobs.filter((job) => {
      if (queryTerms.length === 0) return true;
      const haystack = (job.title + " " + (job.description || "")).toLowerCase();
      return queryTerms.some((t) => haystack.includes(t));
    });

    if (locationTerms.length > 0) {
      filtered = filtered.filter((job) => {
        const loc = (job.location || "").toLowerCase();
        if (!loc) return true;
        return (
          locationTerms.some((t) => loc.includes(t)) ||
          loc.includes("remote") ||
          loc.includes("anywhere")
        );
      });
    }

    if (params.remote) {
      filtered = filtered.filter((job) => job.isRemote);
    }

    filtered = filtered.filter((job) => {
      if (!job.postedAt) return true;
      return new Date(job.postedAt).getTime() >= dateCutoff;
    });

    const perPage = params.resultsPerPage || 20;
    const page = params.page || 1;
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }

  private async fetchCompany(
    company: { slug: string; name: string }
  ): Promise<NormalizedJob[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}?includeCompensation=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "JobHunt/1.0", Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as AshbyResponse;
      const jobs = data.jobs || [];

      return jobs
        .filter((j) => j.isListed !== false)
        .map((j): NormalizedJob => {
          const secondaryLocs = (j.secondaryLocations || [])
            .map((s) => s.location)
            .filter(Boolean) as string[];
          const locations = [j.location, ...secondaryLocs]
            .filter(Boolean)
            .join(", ");
          const workplace = (j.workplaceType || "").toLowerCase();
          const isRemote =
            j.isRemote === true ||
            workplace === "remote" ||
            /remote|anywhere|worldwide/i.test(locations);

          const tags: string[] = [];
          if (j.team) tags.push(j.team);
          if (j.department) tags.push(j.department);
          if (j.employmentType) tags.push(j.employmentType);
          if (j.location) tags.push(j.location);

          // Extract plain description from HTML if needed
          let description: string | null = j.descriptionPlain || null;
          if (!description && j.descriptionHtml) {
            description = j.descriptionHtml
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/\s+/g, " ")
              .trim();
          }

          let salary: string | null = null;
          let salaryMin: number | null = null;
          let salaryMax: number | null = null;
          const tierSummary =
            j.compensation?.compensationTierSummary || j.compensationTierSummary;
          if (tierSummary) salary = tierSummary.slice(0, 120);
          const summaryComponents = j.compensation?.summaryComponents || [];
          for (const c of summaryComponents) {
            if (
              c.compensationType === "Salary" &&
              c.summary &&
              !salary
            ) {
              salary = c.summary.slice(0, 120);
            }
          }

          const postedAt = j.publishedAt || j.updatedAt || null;

          return {
            externalId: `ashby-${company.slug}-${j.id}`,
            provider: "ashby",
            title: j.title,
            company: company.name,
            location: locations || null,
            salary,
            salaryMin,
            salaryMax,
            description: description ? description.slice(0, 5000) : null,
            jobType: j.employmentType || null,
            isRemote,
            applyUrl: j.jobUrl || j.applyUrl || null,
            companyLogo: null,
            postedAt,
            tags: tags.slice(0, 10),
            relevanceScore: null,
            dedupeKey: normalize(j.title) + "|" + normalize(company.name),
          };
        });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
