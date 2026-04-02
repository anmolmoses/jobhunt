import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

// linkedin-jobs-api is CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkedIn = require("linkedin-jobs-api");

const DATE_MAP: Record<string, string> = {
  "1d": "24hr",
  "3d": "past week",
  "7d": "past week",
  "14d": "past month",
  "30d": "past month",
};

const JOB_TYPE_MAP: Record<string, string> = {
  full_time: "full time",
  contract: "contract",
  part_time: "part time",
};

const REMOTE_MAP: Record<string, string> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "on site",
};

export class LinkedInProvider implements JobSearchProvider {
  readonly name = "linkedin" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const queryOptions: Record<string, string | boolean> = {
      keyword: params.query,
      limit: String(params.resultsPerPage || 25),
      page: String((params.page || 1) - 1), // LinkedIn uses 0-based pages
      sortBy: "recent",
    };

    if (params.location) {
      queryOptions.location = params.location;
    }

    if (params.datePosted && DATE_MAP[params.datePosted]) {
      queryOptions.dateSincePosted = DATE_MAP[params.datePosted];
    }

    if (params.remote) {
      queryOptions.remoteFilter = "remote";
    }

    if (params.employmentType?.length) {
      // LinkedIn only accepts one job type at a time; use the first
      const mapped = JOB_TYPE_MAP[params.employmentType[0]];
      if (mapped) queryOptions.jobType = mapped;
    }

    if (params.experienceLevel) {
      const expMap: Record<string, string> = {
        entry: "entry level",
        mid: "associate",
        senior: "senior",
        lead: "director",
        executive: "executive",
      };
      if (expMap[params.experienceLevel]) {
        queryOptions.experienceLevel = expMap[params.experienceLevel];
      }
    }

    if (params.salaryMin) {
      // LinkedIn salary filter uses thresholds
      const thresholds = [40000, 60000, 80000, 100000, 120000];
      const closest = thresholds.reduce((prev, curr) =>
        Math.abs(curr - params.salaryMin!) < Math.abs(prev - params.salaryMin!) ? curr : prev
      );
      queryOptions.salary = String(closest);
    }

    try {
      const results = await linkedIn.query(queryOptions);

      if (!Array.isArray(results)) return [];

      return results.map((job: Record<string, unknown>): NormalizedJob => ({
        externalId: extractJobId(job.jobUrl as string) || String(Math.random()),
        provider: "linkedin",
        title: (job.position as string) || "Unknown",
        company: (job.company as string) || "Unknown",
        location: (job.location as string) || null,
        salary: (job.salary as string) || null,
        salaryMin: parseSalaryMin(job.salary as string),
        salaryMax: null,
        description: null, // LinkedIn scraper doesn't return full descriptions
        jobType: normalizeJobType(queryOptions.jobType as string),
        isRemote: ((job.location as string) || "").toLowerCase().includes("remote") ||
          queryOptions.remoteFilter === "remote",
        applyUrl: (job.jobUrl as string) || null,
        companyLogo: (job.companyLogo as string) || null,
        postedAt: (job.date as string) || null,
        tags: [],
        relevanceScore: null,
        dedupeKey: normalize((job.position as string) || "") + "|" + normalize((job.company as string) || ""),
      }));
    } catch (error) {
      console.error("LinkedIn search error:", error);
      throw new Error(`LinkedIn scraper failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  async isConfigured(): Promise<boolean> {
    // No API key needed — always available
    return true;
  }
}

function extractJobId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/view\/[^/]*?(\d{5,})/);
  return match ? `li-${match[1]}` : null;
}

function parseSalaryMin(salary: string | null): number | null {
  if (!salary) return null;
  const match = salary.match(/[\d,]+/);
  if (match) {
    const num = parseInt(match[0].replace(/,/g, ""));
    return isNaN(num) ? null : num;
  }
  return null;
}

function normalizeJobType(type: string | undefined): string | null {
  if (!type) return null;
  if (type.includes("full")) return "full_time";
  if (type.includes("contract")) return "contract";
  if (type.includes("part")) return "part_time";
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
