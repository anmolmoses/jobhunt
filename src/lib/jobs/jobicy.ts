import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

export class JobicyProvider implements JobSearchProvider {
  readonly name = "jobicy" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    try {
      const searchParams = new URLSearchParams({
        count: String(params.resultsPerPage || 20),
        tag: params.query,
      });

      if (params.location) {
        searchParams.set("geo", params.location.toLowerCase());
      }

      const res = await fetch(
        `https://jobicy.com/api/v2/remote-jobs?${searchParams.toString()}`
      );

      if (!res.ok) throw new Error(`Jobicy API error: ${res.status}`);

      const data = await res.json();
      const jobs = data.jobs || [];

      return jobs.map((job: Record<string, unknown>): NormalizedJob => ({
        externalId: `jobicy-${job.id || Math.random().toString(36).slice(2)}`,
        provider: "jobicy",
        title: (job.jobTitle as string) || "Unknown",
        company: (job.companyName as string) || "Unknown",
        location: (job.jobGeo as string) || "Remote",
        salary: (job.annualSalaryMin && job.annualSalaryMax)
          ? `$${(job.annualSalaryMin as number).toLocaleString()} - $${(job.annualSalaryMax as number).toLocaleString()}`
          : null,
        salaryMin: (job.annualSalaryMin as number) || null,
        salaryMax: (job.annualSalaryMax as number) || null,
        description: (job.jobDescription as string) || null,
        jobType: (job.jobType as string) || null,
        isRemote: true,
        applyUrl: (job.url as string) || null,
        companyLogo: (job.companyLogo as string) || null,
        postedAt: (job.pubDate as string) || null,
        tags: ((job.jobIndustry as string[]) || []).slice(0, 5),
        relevanceScore: null,
        dedupeKey: normalize((job.jobTitle as string) || "") + "|" + normalize((job.companyName as string) || ""),
      }));
    } catch (error) {
      console.error("Jobicy error:", error);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
