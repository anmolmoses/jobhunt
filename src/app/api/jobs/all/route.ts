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

    // Get saved jobs with status and company info for company-level tracking
    const savedJobs = db
      .select({
        jobResultId: schema.savedJobs.jobResultId,
        savedId: schema.savedJobs.id,
        status: schema.savedJobs.status,
        jobTitle: schema.jobResults.title,
        jobCompany: schema.jobResults.company,
      })
      .from(schema.savedJobs)
      .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
      .all();
    const savedMap = new Map(savedJobs.map((s) => [s.jobResultId, s.savedId]));

    // Build company-level tracking map: company (lowercased) → array of tracked jobs
    const companyTrackingMap = new Map<string, { savedJobId: number; jobResultId: number; title: string; status: string }[]>();
    for (const s of savedJobs) {
      const key = s.jobCompany.toLowerCase();
      if (!companyTrackingMap.has(key)) companyTrackingMap.set(key, []);
      companyTrackingMap.get(key)!.push({
        savedJobId: s.savedId,
        jobResultId: s.jobResultId,
        title: s.jobTitle,
        status: s.status,
      });
    }

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

    const enrichedJobs = jobs.map((job) => {
      const companyKey = job.company.toLowerCase();
      const companyTracked = companyTrackingMap.get(companyKey) || [];
      // Other tracked roles at this company (excluding this job itself)
      const otherTrackedRoles = companyTracked.filter((t) => t.jobResultId !== job.id);

      return {
        ...job,
        tags: JSON.parse(job.tags || "[]"),
        savedJobId: savedMap.get(job.id) || null,
        dbId: job.id,
        companyTracking: otherTrackedRoles.length > 0 ? otherTrackedRoles : null,
      };
    });

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
