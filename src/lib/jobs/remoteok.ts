import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const DATE_MAP: Record<string, number> = {
  "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
};

export class RemoteOKProvider implements JobSearchProvider {
  readonly name = "remoteok" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    try {
      const res = await fetch("https://remoteok.com/api", {
        headers: { "User-Agent": "JobHunt/1.0" },
      });

      if (!res.ok) throw new Error(`RemoteOK API error: ${res.status}`);

      const data = await res.json();
      // First element is metadata, rest are jobs
      const jobs = Array.isArray(data) ? data.slice(1) : [];

      const queryTerms = params.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const locationTerms = params.location?.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2) || [];

      // Date filtering
      const maxAgeDays = DATE_MAP[params.datePosted || "30d"] || 30;
      const dateCutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      // Client-side filtering — require title-level match, not just description
      let filtered = jobs.filter((job: Record<string, unknown>) => {
        // Filter by date first
        const jobDate = job.date ? new Date(job.date as string) : null;
        if (jobDate && jobDate < dateCutoff) return false;
        const title = ((job.position as string) || "").toLowerCase();
        const tags = ((job.tags as string[]) || []).map((t) => t.toLowerCase());
        const titleAndTags = `${title} ${tags.join(" ")}`;

        // Require at least one meaningful query term (>3 chars) in the title or tags
        const meaningfulTerms = queryTerms.filter((t) => t.length > 3);
        if (meaningfulTerms.length > 0) {
          return meaningfulTerms.some((t) => titleAndTags.includes(t));
        }
        // Fallback for short terms: require match in title
        return queryTerms.some((t) => title.includes(t));
      });

      // Location filter
      if (locationTerms.length > 0) {
        filtered = filtered.filter((job: Record<string, unknown>) => {
          const loc = ((job.location as string) || "").toLowerCase();
          return locationTerms.some((t) => loc.includes(t)) || loc.includes("worldwide") || loc === "";
        });
      }

      return filtered.slice(0, params.resultsPerPage || 20).map((job: Record<string, unknown>): NormalizedJob => ({
        externalId: `rok-${job.id || Math.random().toString(36).slice(2)}`,
        provider: "remoteok",
        title: (job.position as string) || "Unknown",
        company: (job.company as string) || "Unknown",
        location: (job.location as string) || "Remote",
        salary: formatROKSalary(job.salary_min as number, job.salary_max as number),
        salaryMin: (job.salary_min as number) || null,
        salaryMax: (job.salary_max as number) || null,
        description: (job.description as string) || null,
        jobType: "full_time",
        isRemote: true,
        applyUrl: (job.url as string) || (job.apply_url as string) || null,
        companyLogo: (job.company_logo as string) || (job.logo as string) || null,
        postedAt: (job.date as string) || null,
        tags: ((job.tags as string[]) || []).slice(0, 10),
        relevanceScore: null,
        dedupeKey: normalize((job.position as string) || "") + "|" + normalize((job.company as string) || ""),
      }));
    } catch (error) {
      console.error("RemoteOK error:", error);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

function formatROKSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  if (min) return `$${min.toLocaleString()}+`;
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
