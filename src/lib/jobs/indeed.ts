import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const HOURS_MAP: Record<string, number> = {
  "1d": 24, "3d": 72, "7d": 168, "14d": 336, "30d": 720,
};

export class IndeedProvider implements JobSearchProvider {
  readonly name = "indeed" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const { scrapeJobs, Site } = await import("ts-jobspy");

    try {
      const results = await scrapeJobs({
        siteName: [Site.INDEED],
        searchTerm: params.query,
        location: params.location || undefined,
        resultsWanted: params.resultsPerPage || 20,
        isRemote: params.remote || false,
        hoursOld: HOURS_MAP[params.datePosted || "7d"] || 168,
      });

      return results.map((job): NormalizedJob => ({
        externalId: job.id || `indeed-${Math.random().toString(36).slice(2)}`,
        provider: "indeed",
        title: job.title || "Unknown",
        company: job.company || "Unknown",
        location: job.location || null,
        salary: formatSalary(job.minAmount, job.maxAmount, job.currency),
        salaryMin: job.minAmount || null,
        salaryMax: job.maxAmount || null,
        description: job.description || null,
        jobType: job.jobType || null,
        isRemote: job.isRemote || false,
        applyUrl: job.jobUrl || null,
        companyLogo: job.companyLogo || null,
        postedAt: job.datePosted || null,
        tags: job.skills ? job.skills.split(",").map((s) => s.trim()) : [],
        relevanceScore: null,
        dedupeKey: normalize(job.title || "") + "|" + normalize(job.company || ""),
      }));
    } catch (error) {
      console.error("Indeed (ts-jobspy) error:", error);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

function formatSalary(min: number | null, max: number | null, currency?: string | null): string | null {
  if (!min && !max) return null;
  const c = currency || "";
  if (min && max) return `${c}${min.toLocaleString()} - ${c}${max.toLocaleString()}`;
  if (min) return `${c}${min.toLocaleString()}+`;
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
