import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobResults)
      .get();
    const total = countResult?.count || 0;

    // Get jobs with pagination
    const jobs = db
      .select()
      .from(schema.jobResults)
      .orderBy(desc(schema.jobResults.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Get saved job IDs
    const savedJobs = db
      .select({
        jobResultId: schema.savedJobs.jobResultId,
        savedId: schema.savedJobs.id,
      })
      .from(schema.savedJobs)
      .all();
    const savedMap = new Map(savedJobs.map((s) => [s.jobResultId, s.savedId]));

    // Get unique companies and providers for filter options
    const companies = db
      .select({ company: schema.jobResults.company })
      .from(schema.jobResults)
      .groupBy(schema.jobResults.company)
      .orderBy(schema.jobResults.company)
      .all()
      .map((r) => r.company);

    const providersList = db
      .select({ provider: schema.jobResults.provider })
      .from(schema.jobResults)
      .groupBy(schema.jobResults.provider)
      .all()
      .map((r) => r.provider);

    const enrichedJobs = jobs.map((job) => ({
      ...job,
      tags: JSON.parse(job.tags || "[]"),
      savedJobId: savedMap.get(job.id) || null,
      dbId: job.id,
    }));

    return NextResponse.json({
      jobs: enrichedJobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      filters: {
        companies,
        providers: providersList,
      },
    });
  } catch (error) {
    console.error("Get all jobs error:", error);
    return NextResponse.json({ error: "Failed to get jobs" }, { status: 500 });
  }
}
