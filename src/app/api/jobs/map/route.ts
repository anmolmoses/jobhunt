import { db, schema } from "@/db";
import { desc, isNotNull } from "drizzle-orm";
import { geocodeCompany } from "@/lib/geo/geocode";
import { getCompanyLogoUrl, guessDomain } from "@/lib/company/logo";

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Step 1: Load jobs from DB
        send("step", { step: "Loading jobs from database...", progress: 0 });

        const jobs = db
          .select()
          .from(schema.jobResults)
          .where(isNotNull(schema.jobResults.location))
          .orderBy(desc(schema.jobResults.createdAt))
          .limit(200)
          .all();

        // Get saved job IDs
        const savedJobs = db
          .select({ jobResultId: schema.savedJobs.jobResultId, id: schema.savedJobs.id })
          .from(schema.savedJobs)
          .all();
        const savedMap = new Map(savedJobs.map((s) => [s.jobResultId, s.id]));

        send("step", { step: `Found ${jobs.length} jobs. Loading enrichment data...`, progress: 5 });

        // Load enrichment data
        const enrichments = db.select().from(schema.companyEnrichment).all();
        const enrichmentMap = new Map(
          enrichments.map((e) => [e.normalizedName, e])
        );

        // Build unique company+location list to geocode
        const toGeocode = new Map<string, { company: string; location: string; headquarters: string | null }>();
        const mappableJobs = jobs.filter((job) => {
          if (!job.location) return false;
          const loc = job.location.toLowerCase();
          return loc !== "remote" && loc !== "worldwide" && loc !== "anywhere";
        });

        for (const job of mappableJobs) {
          const companyKey = `${normalizeCompanyName(job.company)}:${(job.location || "").trim().toLowerCase()}`;
          if (!toGeocode.has(companyKey)) {
            const enrichment = enrichmentMap.get(normalizeCompanyName(job.company));
            toGeocode.set(companyKey, {
              company: job.company,
              location: job.location || "",
              headquarters: enrichment?.headquarters || null,
            });
          }
        }

        const totalToGeocode = toGeocode.size;
        send("step", { step: `Geocoding ${totalToGeocode} unique company locations...`, progress: 10 });

        // Step 2: Geocode each unique company+location
        const geoCache = new Map<string, { latitude: number; longitude: number } | null>();
        let geocoded = 0;

        for (const [companyKey, info] of toGeocode) {
          geocoded++;
          const pct = 10 + Math.round((geocoded / totalToGeocode) * 70);
          send("step", {
            step: `Geocoding ${info.company} (${info.location})`,
            detail: `${geocoded}/${totalToGeocode}`,
            progress: pct,
          });

          const domain = guessDomain(info.company);
          const geo = await geocodeCompany(info.company, info.location, info.headquarters, domain);
          geoCache.set(
            companyKey,
            geo.latitude && geo.longitude ? { latitude: geo.latitude, longitude: geo.longitude } : null
          );
        }

        // Step 3: Enrich logos
        send("step", { step: "Enriching company logos...", progress: 82 });

        const logoCache = new Map<string, string | null>();
        const mapJobs: MapJob[] = [];

        for (const job of mappableJobs) {
          const companyKey = `${normalizeCompanyName(job.company)}:${(job.location || "").trim().toLowerCase()}`;
          const coords = geoCache.get(companyKey);
          if (!coords) continue;

          const logoKey = normalizeCompanyName(job.company);
          if (!logoCache.has(logoKey)) {
            logoCache.set(logoKey, job.companyLogo || await getCompanyLogoUrl(job.company, null));
          }

          mapJobs.push({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location || "",
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

        send("step", { step: `Done! Mapped ${mapJobs.length} jobs.`, progress: 100 });

        // Final payload
        send("done", {
          jobs: mapJobs,
          totalWithLocation: mapJobs.length,
          totalJobs: jobs.length,
        });
      } catch (error) {
        console.error("Map data error:", error);
        send("error", { error: "Failed to load map data" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
