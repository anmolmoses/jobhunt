import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, isNotNull } from "drizzle-orm";
import { geocodeCompany, clearGeocodeCache } from "@/lib/geo/geocode";
import { guessDomain } from "@/lib/company/logo";

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/**
 * POST /api/jobs/geocode
 * Background geocoding of all job results.
 * - Default: geocodes only jobs without cached coordinates
 * - ?force=true: clears cache and re-geocodes everything
 *
 * Returns SSE stream with progress updates.
 */
export async function POST(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "true";

  if (force) {
    clearGeocodeCache();
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const jobs = db
          .select()
          .from(schema.jobResults)
          .where(isNotNull(schema.jobResults.location))
          .orderBy(desc(schema.jobResults.createdAt))
          .limit(500)
          .all();

        // Load enrichment data for headquarters
        const enrichments = db.select().from(schema.companyEnrichment).all();
        const enrichmentMap = new Map(enrichments.map((e) => [e.normalizedName, e]));

        // Build unique company+location combos
        const toGeocode = new Map<string, { company: string; location: string; headquarters: string | null }>();

        for (const job of jobs) {
          const loc = (job.location || "").toLowerCase();
          if (!loc || loc === "remote" || loc === "worldwide" || loc === "anywhere") continue;

          const key = `${normalizeCompanyName(job.company)}:${loc.trim()}`;
          if (!toGeocode.has(key)) {
            const enrichment = enrichmentMap.get(normalizeCompanyName(job.company));
            toGeocode.set(key, {
              company: job.company,
              location: job.location || "",
              headquarters: enrichment?.headquarters || null,
            });
          }
        }

        const total = toGeocode.size;
        let done = 0;
        let success = 0;

        send("step", { step: `Geocoding ${total} unique company locations...`, total, progress: 0 });

        for (const [, info] of toGeocode) {
          done++;
          const pct = Math.round((done / total) * 100);
          send("step", {
            step: `${info.company} (${info.location})`,
            detail: `${done}/${total}`,
            progress: pct,
          });

          try {
            const domain = guessDomain(info.company);
            const geo = await geocodeCompany(info.company, info.location, info.headquarters, domain);
            if (geo.latitude) success++;
          } catch (e) {
            console.error("Geocode error for", info.company, info.location, e);
          }
        }

        send("done", { total, success, failed: total - success });
      } catch (error) {
        console.error("Background geocode error:", error);
        send("error", { error: "Geocoding failed" });
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
