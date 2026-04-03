import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { searchJobs } from "@/lib/jobs/orchestrator";

interface CronRunResult {
  status: "success" | "failed";
  jobsFound: number;
  queriesRun: number;
  providersUsed: string[];
  message: string;
  durationMs: number;
}

/**
 * Runs an automated job search using the user's resume preferences.
 * Reuses the same search logic as the autopilot endpoint.
 */
export async function runAutomatedJobSearch(): Promise<CronRunResult> {
  const start = Date.now();

  try {
    // Load resume
    const resume = db
      .select()
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    if (!resume?.parsedText) {
      return {
        status: "failed",
        jobsFound: 0,
        queriesRun: 0,
        providersUsed: [],
        message: "No resume found. Upload a resume first.",
        durationMs: Date.now() - start,
      };
    }

    // Load preferences
    const prefs = db
      .select()
      .from(schema.jobPreferences)
      .orderBy(desc(schema.jobPreferences.updatedAt))
      .limit(1)
      .get();

    if (!prefs) {
      return {
        status: "failed",
        jobsFound: 0,
        queriesRun: 0,
        providersUsed: [],
        message: "No job preferences set. Configure preferences first.",
        durationMs: Date.now() - start,
      };
    }

    // Load cron config for search parameters
    const cronConfig = db
      .select()
      .from(schema.cronConfig)
      .limit(1)
      .get();

    const datePosted = (cronConfig?.datePosted as "1d" | "3d" | "7d" | "14d" | "30d") || "7d";
    const resultsPerPage = cronConfig?.resultsPerPage || 25;

    // Build search queries from preferences
    const safeParse = (s: string, fallback: unknown = []) => {
      try { return JSON.parse(s); } catch { return fallback; }
    };

    const desiredRoles: string[] = safeParse(prefs.desiredRoles, []);
    const searchQueries = desiredRoles.length > 0
      ? desiredRoles.slice(0, 3) // Use top 3 roles as search queries
      : ["software developer"]; // Fallback

    // Get location preferences
    const preferredLocations: string[] = safeParse(prefs.preferredLocations, []);
    const locationPref = safeParse(prefs.locationPreference, ["remote"]);
    const searchLocation = preferredLocations.length > 0 ? preferredLocations[0] : undefined;
    const searchRemote = Array.isArray(locationPref) ? locationPref.includes("remote") : locationPref === "remote";

    const experienceLevel = prefs.experienceLevel as "senior" | "mid" | "entry" | "lead" | "executive" | undefined;

    // Run searches
    const allProviders = new Set<string>();
    let totalJobs = 0;
    let queriesRun = 0;

    for (const query of searchQueries) {
      try {
        const result = await searchJobs({
          query,
          location: searchLocation,
          remote: searchRemote || undefined,
          experienceLevel,
          datePosted,
          resultsPerPage,
        });
        totalJobs += result.jobs.length;
        queriesRun++;
        for (const pr of result.providerResults) {
          allProviders.add(pr.provider);
        }
      } catch (err) {
        console.error(`[cron] Search failed for query "${query}":`, err);
      }
    }

    const providersUsed = Array.from(allProviders);
    const duration = Date.now() - start;

    if (queriesRun === 0) {
      return {
        status: "failed",
        jobsFound: 0,
        queriesRun: 0,
        providersUsed,
        message: "All search queries failed. Check your API keys and provider configuration.",
        durationMs: duration,
      };
    }

    return {
      status: "success",
      jobsFound: totalJobs,
      queriesRun,
      providersUsed,
      message: `Found ${totalJobs} jobs from ${queriesRun} queries across ${providersUsed.length} providers`,
      durationMs: duration,
    };
  } catch (err) {
    return {
      status: "failed",
      jobsFound: 0,
      queriesRun: 0,
      providersUsed: [],
      message: err instanceof Error ? err.message : "Unknown error during automated search",
      durationMs: Date.now() - start,
    };
  }
}
