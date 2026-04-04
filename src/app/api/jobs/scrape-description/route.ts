import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { isFirecrawlConfigured, scrapeJobDescription } from "@/lib/firecrawl/client";

export async function POST(request: NextRequest) {
  try {
    const { jobResultId, applyUrl } = await request.json();

    if (!jobResultId && !applyUrl) {
      return NextResponse.json({ error: "jobResultId or applyUrl required" }, { status: 400 });
    }

    if (!(await isFirecrawlConfigured())) {
      return NextResponse.json({ error: "Firecrawl not configured" }, { status: 503 });
    }

    let url = applyUrl;

    if (jobResultId && !url) {
      const job = db
        .select()
        .from(schema.jobResults)
        .where(eq(schema.jobResults.id, jobResultId))
        .get();

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      url = job.applyUrl;
    }

    if (!url) {
      return NextResponse.json({ error: "No apply URL available for this job" }, { status: 400 });
    }

    const description = await scrapeJobDescription(url);

    if (!description) {
      return NextResponse.json({ error: "Failed to scrape job description" }, { status: 502 });
    }

    return NextResponse.json({ description, source: "firecrawl", url });
  } catch (error) {
    console.error("Scrape description error:", error);
    return NextResponse.json({ error: "Failed to scrape description" }, { status: 500 });
  }
}
