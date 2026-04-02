import { getSetting } from "@/lib/settings";
import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const DATE_MAP: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

export class AdzunaProvider implements JobSearchProvider {
  readonly name = "adzuna" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const appId = await getSetting("adzuna_app_id");
    const appKey = await getSetting("adzuna_app_key");
    const country = (await getSetting("adzuna_country")) || "us";

    if (!appId || !appKey) throw new Error("Adzuna API credentials not configured");

    const page = params.page || 1;
    const searchParams = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      results_per_page: String(params.resultsPerPage || 20),
      what: params.query,
    });

    if (params.location) searchParams.set("where", params.location);
    if (params.datePosted && DATE_MAP[params.datePosted]) {
      searchParams.set("max_days_old", String(DATE_MAP[params.datePosted]));
    }
    if (params.salaryMin) searchParams.set("salary_min", String(params.salaryMin));
    if (params.employmentType?.length) {
      if (params.employmentType.includes("full_time")) searchParams.set("full_time", "1");
      if (params.employmentType.includes("part_time")) searchParams.set("part_time", "1");
      if (params.employmentType.includes("contract")) searchParams.set("contract", "1");
    }

    const res = await fetch(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${searchParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Adzuna API error: ${res.status}`);
    }

    const data = await res.json();
    const results = data.results || [];

    return results.map((job: Record<string, unknown>): NormalizedJob => {
      const location = job.location as { display_name?: string } | undefined;
      const company = job.company as { display_name?: string } | undefined;
      const category = job.category as { label?: string } | undefined;

      return {
        externalId: (job.id as string) || String(job.id),
        provider: "adzuna",
        title: (job.title as string) || "Unknown",
        company: company?.display_name || "Unknown",
        location: location?.display_name || null,
        salary: formatAdzunaSalary(job.salary_min as number, job.salary_max as number),
        salaryMin: (job.salary_min as number) || null,
        salaryMax: (job.salary_max as number) || null,
        description: (job.description as string) || null,
        jobType: (job.contract_time as string) === "full_time" ? "full_time" : (job.contract_type as string) || null,
        isRemote: ((job.title as string) || "").toLowerCase().includes("remote") ||
          ((job.description as string) || "").toLowerCase().includes("remote"),
        applyUrl: (job.redirect_url as string) || null,
        companyLogo: null,
        postedAt: (job.created as string) || null,
        tags: category?.label ? [category.label] : [],
        relevanceScore: null,
        dedupeKey: normalize((job.title as string) || "") + "|" + normalize(company?.display_name || ""),
      };
    });
  }

  async isConfigured(): Promise<boolean> {
    const appId = await getSetting("adzuna_app_id");
    const appKey = await getSetting("adzuna_app_key");
    return !!appId && !!appKey;
  }
}

function formatAdzunaSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max) return `$${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()}`;
  if (min) return `$${Math.round(min).toLocaleString()}+`;
  if (max) return `Up to $${Math.round(max).toLocaleString()}`;
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
