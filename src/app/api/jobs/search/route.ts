import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { searchJobs } from "@/lib/jobs/orchestrator";
import { recordAction } from "@/lib/gamification";
import { geocodeCompany } from "@/lib/geo/geocode";
import { guessDomain } from "@/lib/company/logo";
import type { JobSearchParams, NormalizedJob } from "@/types/jobs";

/**
 * Background geocode newly found jobs (fire-and-forget).
 * Runs after search results are returned to the user.
 */
async function backgroundGeocode(jobs: NormalizedJob[]) {
  const seen = new Set<string>();

  for (const job of jobs) {
    const loc = (job.location || "").toLowerCase();
    if (!loc || loc === "remote" || loc === "worldwide" || loc === "anywhere") continue;

    const key = `${job.company.toLowerCase()}:${loc}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const domain = guessDomain(job.company);
      await geocodeCompany(job.company, job.location || "", null, domain);
    } catch {
      // Best-effort, don't block
    }
  }
}

function getSettingValue(key: string): string | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Load search config defaults for values not explicitly provided
    const configDatePosted = getSettingValue("search_date_posted") || "7d";
    const configResultsPerPage = parseInt(getSettingValue("search_results_per_page") || "20", 10);
    let enabledProviders: string[] | undefined;
    try {
      const raw = getSettingValue("search_enabled_providers");
      if (raw) enabledProviders = JSON.parse(raw);
    } catch { /* use all */ }

    const params: JobSearchParams = {
      query: body.query || "",
      location: body.location,
      remote: body.remote,
      datePosted: body.datePosted || configDatePosted,
      salaryMin: body.salaryMin,
      employmentType: body.employmentType,
      page: body.page || 1,
      resultsPerPage: body.resultsPerPage || configResultsPerPage,
    };

    if (!params.query.trim()) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 });
    }

    // Use providers from body if specified, otherwise from config
    const providers = body.providers || enabledProviders;
    const result = await searchJobs(params, providers);
    try { recordAction("search"); } catch (e) { console.error("Gamification error:", e); }

    // Fire-and-forget: pre-geocode job locations in the background
    // This means the map will have coordinates ready when the user visits it
    backgroundGeocode(result.jobs).catch((e) =>
      console.error("Background geocode error:", e)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
