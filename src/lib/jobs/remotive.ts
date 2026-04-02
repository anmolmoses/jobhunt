import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const DATE_MAP: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

export class RemotiveProvider implements JobSearchProvider {
  readonly name = "remotive" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set("search", params.query);
    if (params.resultsPerPage) searchParams.set("limit", String(params.resultsPerPage));

    const res = await fetch(
      `https://remotive.com/api/remote-jobs?${searchParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Remotive API error: ${res.status}`);
    }

    const data = await res.json();
    let jobs: Record<string, unknown>[] = data.jobs || [];

    // Client-side date filtering
    if (params.datePosted && DATE_MAP[params.datePosted]) {
      const maxDays = DATE_MAP[params.datePosted];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxDays);
      jobs = jobs.filter((job) => {
        const posted = new Date(job.publication_date as string);
        return posted >= cutoff;
      });
    }

    // Client-side location filtering
    if (params.location) {
      const locLower = params.location.toLowerCase();
      const locTerms = locLower.split(/[\s,]+/).filter((t) => t.length > 2);
      jobs = jobs.filter((job) => {
        const jobLoc = ((job.candidate_required_location as string) || "").toLowerCase();
        // Keep if job location mentions any of the search location terms, or is worldwide/anywhere
        return (
          locTerms.some((t) => jobLoc.includes(t)) ||
          jobLoc.includes("worldwide") ||
          jobLoc.includes("anywhere") ||
          jobLoc === ""
        );
      });
    }

    // Client-side employment type filtering
    if (params.employmentType?.length) {
      jobs = jobs.filter((job) => {
        const type = ((job.job_type as string) || "").toLowerCase();
        return params.employmentType!.some((t) => {
          if (t === "full_time") return type.includes("full");
          if (t === "contract") return type.includes("contract") || type.includes("freelance");
          if (t === "part_time") return type.includes("part");
          return false;
        });
      });
    }

    return jobs.slice(0, params.resultsPerPage || 20).map((job): NormalizedJob => ({
      externalId: String(job.id || ""),
      provider: "remotive",
      title: (job.title as string) || "Unknown",
      company: (job.company_name as string) || "Unknown",
      location: (job.candidate_required_location as string) || "Remote",
      salary: (job.salary as string) || null,
      salaryMin: null,
      salaryMax: null,
      description: (job.description as string) || null,
      jobType: normalizeJobType(job.job_type as string),
      isRemote: true,
      applyUrl: (job.url as string) || null,
      companyLogo: (job.company_logo as string) || null,
      postedAt: (job.publication_date as string) || null,
      tags: ((job.tags as string[]) || []),
      relevanceScore: null,
      dedupeKey: normalize((job.title as string) || "") + "|" + normalize((job.company_name as string) || ""),
    }));
  }

  async isConfigured(): Promise<boolean> {
    return true; // No API key needed
  }
}

function normalizeJobType(type: string | null): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes("full")) return "full_time";
  if (t.includes("contract") || t.includes("freelance")) return "contract";
  if (t.includes("part")) return "part_time";
  return type.toLowerCase();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
