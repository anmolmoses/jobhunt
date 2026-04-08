import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

const DEFAULT_BOARD_TOKENS = [
  "anthropic",
  "stripe",
  "figma",
  "vercel",
  "notion",
  "linear",
  "retool",
  "pinecone",
  "langchain",
  "cohere",
];

const DATE_MAP: Record<string, number> = {
  "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
};

interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  absolute_url: string;
  content?: string;
  location: { name: string };
  departments: { name: string }[];
  metadata?: { id: number; name: string; value: string | null }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

interface BoardConfig {
  token: string;
  companyName: string;
  logoUrl: string | null;
}

/**
 * Extract a Greenhouse board token from an API endpoint URL.
 * e.g. "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs" -> "anthropic"
 */
function extractBoardToken(apiEndpoint: string): string | null {
  const match = apiEndpoint.match(/\/boards\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Convert a board token to a display-friendly company name.
 * e.g. "pinecone" -> "Pinecone", "langchain" -> "Langchain"
 */
function tokenToCompanyName(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export class GreenhouseProvider implements JobSearchProvider {
  readonly name = "greenhouse" as const;

  private getBoardConfigs(): BoardConfig[] {
    try {
      const portals = db
        .select()
        .from(schema.companyPortals)
        .where(
          and(
            eq(schema.companyPortals.scanMethod, "greenhouse"),
            eq(schema.companyPortals.enabled, true),
          )
        )
        .all();

      if (portals.length > 0) {
        const configs: BoardConfig[] = [];
        for (const portal of portals) {
          let token: string | null = null;

          // Try to extract from apiEndpoint first
          if (portal.apiEndpoint) {
            token = extractBoardToken(portal.apiEndpoint);
          }

          // Fall back to normalizedName (often the board token)
          if (!token) {
            token = portal.normalizedName;
          }

          if (token) {
            configs.push({
              token,
              companyName: portal.companyName,
              logoUrl: portal.logoUrl,
            });
          }
        }

        if (configs.length > 0) return configs;
      }
    } catch {
      // DB not available or table doesn't exist yet — use defaults
    }

    return DEFAULT_BOARD_TOKENS.map((token) => ({
      token,
      companyName: tokenToCompanyName(token),
      logoUrl: null,
    }));
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const boards = this.getBoardConfigs();
    const queryTerms = params.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    const locationTerms = params.location
      ?.toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t.length > 2) || [];

    // Date filtering
    const maxAgeDays = DATE_MAP[params.datePosted || "30d"] || 30;
    const dateCutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    // Fetch from all boards in parallel
    const results = await Promise.allSettled(
      boards.map((board) => this.fetchBoard(board))
    );

    const allJobs: NormalizedJob[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        allJobs.push(...result.value);
      }
    }

    // Filter by query terms — match against title (case-insensitive)
    let filtered = allJobs.filter((job) => {
      const titleLower = job.title.toLowerCase();
      // Every meaningful query term (>3 chars) must appear in the title, OR
      // at least one term matches for shorter queries
      const meaningfulTerms = queryTerms.filter((t) => t.length > 3);
      if (meaningfulTerms.length > 0) {
        return meaningfulTerms.some((t) => titleLower.includes(t));
      }
      return queryTerms.some((t) => titleLower.includes(t));
    });

    // Filter by location if provided
    if (locationTerms.length > 0) {
      filtered = filtered.filter((job) => {
        const loc = (job.location || "").toLowerCase();
        return (
          locationTerms.some((t) => loc.includes(t)) ||
          loc.includes("remote") ||
          loc.includes("worldwide") ||
          loc.includes("anywhere") ||
          loc === ""
        );
      });
    }

    // Filter by remote preference
    if (params.remote) {
      filtered = filtered.filter((job) => job.isRemote);
    }

    // Filter by date
    filtered = filtered.filter((job) => {
      if (!job.postedAt) return true;
      const jobDate = new Date(job.postedAt);
      return jobDate >= dateCutoff;
    });

    // Paginate
    const perPage = params.resultsPerPage || 20;
    const page = params.page || 1;
    const start = (page - 1) * perPage;

    return filtered.slice(start, start + perPage);
  }

  private async fetchBoard(board: BoardConfig): Promise<NormalizedJob[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "JobHunt/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.error(`Greenhouse board "${board.token}" returned ${res.status}`);
        return [];
      }

      const data: GreenhouseResponse = await res.json();
      if (!data.jobs || !Array.isArray(data.jobs)) return [];

      return data.jobs.map((job): NormalizedJob => {
        const locationName = job.location?.name || "";
        const isRemote =
          /remote/i.test(locationName) ||
          /worldwide/i.test(locationName) ||
          /anywhere/i.test(locationName);
        const departments = (job.departments || [])
          .map((d) => d.name)
          .filter(Boolean);

        return {
          externalId: `gh-${board.token}-${job.id}`,
          provider: "greenhouse",
          title: job.title,
          company: board.companyName,
          location: locationName || null,
          salary: null,
          salaryMin: null,
          salaryMax: null,
          description: job.content || null,
          jobType: null,
          isRemote,
          applyUrl: job.absolute_url || null,
          companyLogo: board.logoUrl,
          postedAt: job.updated_at || null,
          tags: departments.slice(0, 10),
          relevanceScore: null,
          dedupeKey:
            normalize(job.title) + "|" + normalize(board.companyName),
        };
      });
    } catch (error) {
      console.error(`Greenhouse fetch error for "${board.token}":`, error);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    // Greenhouse public API requires no API key — always configured
    return true;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
