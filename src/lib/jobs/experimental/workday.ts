import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

/**
 * Workday public "cxs" search API, per-tenant:
 *   POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{siteId}/jobs
 *   body: { appliedFacets: {}, limit, offset, searchText }
 * No auth. Returns `{ total, jobPostings: [...] }`.
 */

interface WorkdayTenant {
  tenant: string;      // subdomain e.g. "adobe"
  wd: string;          // datacenter, e.g. "wd5"
  siteId: string;      // job board site id
  name: string;        // display company name
  host?: string;       // full host override (for non-standard URLs)
}

// Verified-working tenants (curl-checked: endpoint returns JSON with jobPostings).
const SEED_TENANTS: WorkdayTenant[] = [
  { tenant: "adobe", wd: "wd5", siteId: "external_experienced", name: "Adobe" },
  { tenant: "nvidia", wd: "wd5", siteId: "nvidiaexternalcareersite", name: "NVIDIA" },
  { tenant: "salesforce", wd: "wd12", siteId: "External_Career_Site", name: "Salesforce" },
  { tenant: "workday", wd: "wd5", siteId: "Workday", name: "Workday" },
  { tenant: "pwc", wd: "wd3", siteId: "Global_Experienced_Careers", name: "PwC" },
  { tenant: "capitalone", wd: "wd12", siteId: "Capital_One", name: "Capital One" },
  { tenant: "hp", wd: "wd5", siteId: "ExternalCareerSite", name: "HP" },
  { tenant: "citi", wd: "wd5", siteId: "2", name: "Citi" },
  { tenant: "3m", wd: "wd1", siteId: "Search", name: "3M" },
];

const DATE_MAP: Record<string, number> = {
  "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
};

interface WorkdayJobPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdayResponse {
  total?: number;
  jobPostings?: WorkdayJobPosting[];
}

export class WorkdayProvider implements JobSearchProvider {
  readonly name = "workday" as const;

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

    const perCompanyLimit = Math.min(
      Math.max(params.resultsPerPage || 20, 20),
      50
    );

    const results = await Promise.allSettled(
      SEED_TENANTS.map((t) =>
        this.fetchTenant(t, params.query || "", perCompanyLimit)
      )
    );

    const allJobs: NormalizedJob[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") allJobs.push(...r.value);
    }

    // Workday already filters by searchText server-side, but still apply
    // client-side substring match when the caller has unused terms (safety net).
    let filtered = allJobs.filter((job) => {
      if (queryTerms.length === 0) return true;
      const haystack = job.title.toLowerCase();
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
      // Workday postedOn is a text label ("Posted 5 Days Ago", "Posted 30+ Days Ago", ...).
      // Convert the label to an approximate age in days and drop old jobs.
      const ageDays = parseWorkdayPostedOn(job.postedAt);
      if (ageDays == null) return true;
      return ageDays <= maxAgeDays;
    });

    const perPage = params.resultsPerPage || 20;
    const page = params.page || 1;
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }

  private async fetchTenant(
    t: WorkdayTenant,
    searchText: string,
    limit: number
  ): Promise<NormalizedJob[]> {
    const host =
      t.host || `https://${t.tenant}.${t.wd}.myworkdayjobs.com`;
    const url = `${host}/wday/cxs/${t.tenant}/${t.siteId}/jobs`;
    const baseHost = `https://${t.tenant}.${t.wd}.myworkdayjobs.com/en-US/${t.siteId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (JobHunt/1.0)",
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit,
          offset: 0,
          searchText: searchText.slice(0, 100),
        }),
        signal: controller.signal,
      });

      if (!res.ok) return [];
      const data = (await res.json()) as WorkdayResponse;
      const postings = data.jobPostings || [];

      return postings.map((p): NormalizedJob => {
        const locText = p.locationsText || "";
        const isRemote = /remote|anywhere|virtual/i.test(locText);
        const externalId =
          (p.bulletFields && p.bulletFields[0]) ||
          (p.externalPath ? p.externalPath.split("/").pop() || "" : "") ||
          Math.random().toString(36).slice(2);
        const applyUrl = p.externalPath ? `${baseHost}${p.externalPath}` : null;

        return {
          externalId: `workday-${t.tenant}-${externalId}`,
          provider: "workday",
          title: p.title,
          company: t.name,
          location: locText || null,
          salary: null,
          salaryMin: null,
          salaryMax: null,
          description: null,
          jobType: null,
          isRemote,
          applyUrl,
          companyLogo: null,
          postedAt: p.postedOn || null,
          tags: [],
          relevanceScore: null,
          dedupeKey: normalize(p.title) + "|" + normalize(t.name),
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

/**
 * Parse Workday "postedOn" labels into an approximate age in days.
 * Examples: "Posted Today" → 0, "Posted 5 Days Ago" → 5, "Posted 30+ Days Ago" → 31.
 * Returns null for unrecognized formats so the caller can keep the job.
 */
function parseWorkdayPostedOn(label: string | null): number | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (/today|just posted/.test(l)) return 0;
  if (/yesterday/.test(l)) return 1;
  const plusMatch = l.match(/(\d+)\+\s*days?/);
  if (plusMatch) return parseInt(plusMatch[1], 10) + 1;
  const dayMatch = l.match(/(\d+)\s*days?/);
  if (dayMatch) return parseInt(dayMatch[1], 10);
  const hourMatch = l.match(/(\d+)\s*hours?/);
  if (hourMatch) return 0;
  return null;
}
