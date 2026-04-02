import { getSetting } from "@/lib/settings";
import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const DATE_MAP: Record<string, string> = {
  "1d": "today",
  "3d": "3days",
  "7d": "week",
  "14d": "week",
  "30d": "month",
};

export class JSearchProvider implements JobSearchProvider {
  readonly name = "jsearch" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const apiKey = await getSetting("jsearch_api_key");
    if (!apiKey) throw new Error("JSearch API key not configured");

    const searchParams = new URLSearchParams({
      query: params.query + (params.location ? ` in ${params.location}` : ""),
      page: String(params.page || 1),
      num_pages: "1",
    });

    if (params.remote) searchParams.set("remote_jobs_only", "true");
    if (params.datePosted && DATE_MAP[params.datePosted]) {
      searchParams.set("date_posted", DATE_MAP[params.datePosted]);
    }
    if (params.employmentType?.length) {
      searchParams.set(
        "employment_types",
        params.employmentType
          .map((t) => t === "full_time" ? "FULLTIME" : t === "contract" ? "CONTRACTOR" : "PARTTIME")
          .join(",")
      );
    }

    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?${searchParams.toString()}`,
      {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`JSearch API error: ${res.status}`);
    }

    const data = await res.json();
    const jobs = data.data || [];

    return jobs.map((job: Record<string, unknown>): NormalizedJob => ({
      externalId: (job.job_id as string) || "",
      provider: "jsearch",
      title: (job.job_title as string) || "Unknown",
      company: (job.employer_name as string) || "Unknown",
      location: [job.job_city, job.job_state, job.job_country]
        .filter(Boolean)
        .join(", ") || null,
      salary: formatSalary(job.job_min_salary as number, job.job_max_salary as number, job.job_salary_currency as string),
      salaryMin: (job.job_min_salary as number) || null,
      salaryMax: (job.job_max_salary as number) || null,
      description: (job.job_description as string) || null,
      jobType: normalizeJobType(job.job_employment_type as string),
      isRemote: (job.job_is_remote as boolean) || false,
      applyUrl: (job.job_apply_link as string) || null,
      companyLogo: (job.employer_logo as string) || null,
      postedAt: (job.job_posted_at_datetime_utc as string) || null,
      tags: [],
      relevanceScore: null,
      dedupeKey: normalize((job.job_title as string) || "") + "|" + normalize((job.employer_name as string) || ""),
    }));
  }

  async isConfigured(): Promise<boolean> {
    const key = await getSetting("jsearch_api_key");
    return !!key;
  }
}

function formatSalary(min: number | null, max: number | null, currency?: string): string | null {
  if (!min && !max) return null;
  const c = currency || "USD";
  if (min && max) return `${c} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  if (min) return `${c} ${min.toLocaleString()}+`;
  if (max) return `Up to ${c} ${max.toLocaleString()}`;
  return null;
}

function normalizeJobType(type: string | null): string | null {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t.includes("FULL")) return "full_time";
  if (t.includes("CONTRACT") || t.includes("FREELANCE")) return "contract";
  if (t.includes("PART")) return "part_time";
  return type.toLowerCase();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
