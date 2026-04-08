import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { recordAction } from "@/lib/gamification";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, company, location, salary, description, jobType, isRemote, applyUrl, status, notes } = body;

    if (!title || !company) {
      return NextResponse.json({ error: "Title and company are required" }, { status: 400 });
    }

    // Get or create a "manual" search record
    let manualSearch = db
      .select()
      .from(schema.jobSearches)
      .where(eq(schema.jobSearches.query, "__manual__"))
      .get();

    if (!manualSearch) {
      manualSearch = db
        .insert(schema.jobSearches)
        .values({
          query: "__manual__",
          filters: "{}",
          providers: '["manual"]',
          totalResults: 0,
        })
        .returning()
        .get();
    }

    // Insert the job result
    const dedupeKey = normalize(title) + "|" + normalize(company);
    const jobResult = db
      .insert(schema.jobResults)
      .values({
        searchId: manualSearch.id,
        externalId: `manual-${Date.now()}`,
        provider: "manual",
        title,
        company,
        location: location || null,
        salary: salary || null,
        description: description || null,
        jobType: jobType || null,
        isRemote: isRemote || false,
        applyUrl: applyUrl || null,
        tags: "[]",
        dedupeKey,
      })
      .returning()
      .get();

    // Auto-save to tracker
    const savedJob = db
      .insert(schema.savedJobs)
      .values({
        jobResultId: jobResult.id,
        status: status || "saved",
        notes: notes || null,
      })
      .returning()
      .get();

    try {
      recordAction("save_job", { jobResultId: jobResult.id });
    } catch { /* silent */ }

    return NextResponse.json({
      ...savedJob,
      job: { ...jobResult, tags: [] },
    }, { status: 201 });
  } catch (error) {
    console.error("Custom job creation error:", error);
    return NextResponse.json({ error: "Failed to create custom job" }, { status: 500 });
  }
}
