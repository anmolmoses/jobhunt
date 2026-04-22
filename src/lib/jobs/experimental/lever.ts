import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

/**
 * Lever public postings API: `https://api.lever.co/v0/postings/{slug}?mode=json`
 * No auth required. Returns an array of posting objects for that company.
 */

// Verified-working slugs (curl-checked 200 OK, returns >0 postings).
const SEED_COMPANIES: { slug: string; name: string }[] = [
  { slug: "plaid", name: "Plaid" },
  { slug: "lever", name: "Lever" },
  { slug: "attentive", name: "Attentive" },
  { slug: "spotify", name: "Spotify" },
  { slug: "palantir", name: "Palantir" },
  { slug: "kraken", name: "Kraken" },
  { slug: "workos", name: "WorkOS" },
  { slug: "jobvite", name: "Jobvite" },
  { slug: "leverdemo", name: "LeverDemo" },
];

const DATE_MAP: Record<string, number> = {
  "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
};

interface LeverCategories {
  commitment?: string | null;
  department?: string | null;
  location?: string | null;
  team?: string | null;
  allLocations?: string[];
}

interface LeverPosting {
  id: string;
  text: string;
  createdAt: number;
  hostedUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;
  categories?: LeverCategories;
  workplaceType?: string | null;
  country?: string | null;
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  } | null;
  salaryDescription?: string | null;
}

export class LeverProvider implements JobSearchProvider {
  readonly name = "lever" as const;

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

    // Query filter — substring in title OR description
    let filtered = allJobs.filter((job) => {
      if (queryTerms.length === 0) return true;
      const haystack = (
        job.title + " " + (job.description || "")
      ).toLowerCase();
      return queryTerms.some((t) => haystack.includes(t));
    });

    // Location filter — substring in location
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

    // Remote filter
    if (params.remote) {
      filtered = filtered.filter((job) => job.isRemote);
    }

    // Date filter
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
    const url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "JobHunt/1.0", Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as LeverPosting[];
      if (!Array.isArray(data)) return [];

      return data.map((p): NormalizedJob => {
        const cat = p.categories || {};
        const locations = cat.allLocations && cat.allLocations.length > 0
          ? cat.allLocations.join(", ")
          : cat.location || "";
        const workplace = (p.workplaceType || "").toLowerCase();
        const isRemote =
          workplace === "remote" ||
          /remote|anywhere|worldwide/i.test(locations);

        const tags: string[] = [];
        if (cat.team) tags.push(cat.team);
        if (cat.department) tags.push(cat.department);
        if (cat.commitment) tags.push(cat.commitment);
        if (cat.location) tags.push(cat.location);

        let salary: string | null = null;
        let salaryMin: number | null = null;
        let salaryMax: number | null = null;
        if (p.salaryRange) {
          salaryMin = p.salaryRange.min ?? null;
          salaryMax = p.salaryRange.max ?? null;
          if (salaryMin || salaryMax) {
            const cur = p.salaryRange.currency || "USD";
            salary = `${cur} ${salaryMin ?? "?"} - ${salaryMax ?? "?"}`;
          }
        } else if (p.salaryDescription) {
          salary = p.salaryDescription.slice(0, 120);
        }

        return {
          externalId: `lever-${company.slug}-${p.id}`,
          provider: "lever",
          title: p.text,
          company: company.name,
          location: locations || null,
          salary,
          salaryMin,
          salaryMax,
          description: p.descriptionPlain || p.description || null,
          jobType: cat.commitment || null,
          isRemote,
          applyUrl: p.hostedUrl || p.applyUrl || null,
          companyLogo: null,
          postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          tags: tags.slice(0, 10),
          relevanceScore: null,
          dedupeKey: normalize(p.text) + "|" + normalize(company.name),
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
