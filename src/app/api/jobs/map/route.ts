import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, isNotNull } from "drizzle-orm";
import { geocode } from "@/lib/geo/geocode";
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

    // Geocode all unique locations
    const mapJobs: MapJob[] = [];

    for (const job of jobs) {
      if (!job.location || job.location.toLowerCase() === "remote" || job.location.toLowerCase() === "worldwide") {
        continue;
      }

      const geo = await geocode(job.location);

      if (geo.latitude && geo.longitude) {
        // Enrich logo if missing
        const logo = job.companyLogo || await getCompanyLogoUrl(job.company, null);

        mapJobs.push({
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary,
          isRemote: job.isRemote,
          applyUrl: job.applyUrl,
          companyLogo: logo,
          postedAt: job.postedAt,
          provider: job.provider,
          latitude: geo.latitude,
          longitude: geo.longitude,
          savedJobId: savedMap.get(job.id) || null,
        });
      }

      // Small delay to respect Nominatim rate limit for uncached
      // (geocode function handles caching internally)
    }

    // Group by approximate location for cluster info
    const locationGroups = new Map<string, number>();
    for (const job of mapJobs) {
      const key = `${Math.round(job.latitude * 10) / 10},${Math.round(job.longitude * 10) / 10}`;
      locationGroups.set(key, (locationGroups.get(key) || 0) + 1);
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
