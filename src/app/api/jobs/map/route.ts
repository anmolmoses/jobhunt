import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, isNotNull } from "drizzle-orm";
import { geocodeCompany } from "@/lib/geo/geocode";
import { getCompanyLogoUrl } from "@/lib/company/logo";

export interface MapJob {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  isRemote: boolean;
  applyUrl: string | null;
  companyLogo: string | null;
  postedAt: string | null;
  provider: string;
  latitude: number;
  longitude: number;
  savedJobId: number | null;
}

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export async function GET() {
  try {
    // Get all job results that have a location
    const jobs = db
      .select()
      .from(schema.jobResults)
      .where(isNotNull(schema.jobResults.location))
      .orderBy(desc(schema.jobResults.createdAt))
      .limit(200)
      .all();

    // Get saved job IDs for marking on map
    const savedJobs = db
      .select({ jobResultId: schema.savedJobs.jobResultId, id: schema.savedJobs.id })
      .from(schema.savedJobs)
      .all();
    const savedMap = new Map(savedJobs.map((s) => [s.jobResultId, s.id]));

    // Load company enrichment data for headquarters info
    const enrichments = db.select().from(schema.companyEnrichment).all();
    const enrichmentMap = new Map(
      enrichments.map((e) => [e.normalizedName, e])
    );

    // Geocode by company+location combo (much more accurate than just location)
    // Cache geocode results per company+location to avoid redundant API calls
    const geoCache = new Map<string, { latitude: number; longitude: number } | null>();
    const logoCache = new Map<string, string | null>();
    const mapJobs: MapJob[] = [];

    for (const job of jobs) {
      if (!job.location || job.location.toLowerCase() === "remote" || job.location.toLowerCase() === "worldwide") {
        continue;
      }

      const companyKey = `${normalizeCompanyName(job.company)}:${job.location.trim().toLowerCase()}`;

      // Check if we already geocoded this company+location combo
      if (!geoCache.has(companyKey)) {
        // Get headquarters from enrichment data if available
        const enrichment = enrichmentMap.get(normalizeCompanyName(job.company));
        const headquarters = enrichment?.headquarters || null;

        const geo = await geocodeCompany(job.company, job.location, headquarters);
        geoCache.set(
          companyKey,
          geo.latitude && geo.longitude ? { latitude: geo.latitude, longitude: geo.longitude } : null
        );
      }

      const coords = geoCache.get(companyKey);
      if (!coords) continue;

      // Enrich logo (cache per company to avoid redundant lookups)
      const logoKey = normalizeCompanyName(job.company);
      if (!logoCache.has(logoKey)) {
        logoCache.set(logoKey, job.companyLogo || await getCompanyLogoUrl(job.company, null));
      }

      mapJobs.push({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        isRemote: job.isRemote,
        applyUrl: job.applyUrl,
        companyLogo: logoCache.get(logoKey) || job.companyLogo,
        postedAt: job.postedAt,
        provider: job.provider,
        latitude: coords.latitude,
        longitude: coords.longitude,
        savedJobId: savedMap.get(job.id) || null,
      });
    }

    return NextResponse.json({
      jobs: mapJobs,
      totalWithLocation: mapJobs.length,
      totalJobs: jobs.length,
    });
  } catch (error) {
    console.error("Map data error:", error);
    return NextResponse.json({ error: "Failed to load map data" }, { status: 500 });
  }
}
