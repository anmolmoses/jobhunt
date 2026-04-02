import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, sql, gte } from "drizzle-orm";

export async function GET() {
  try {
    // Latest resume analysis
    const latestAnalysis = db
      .select()
      .from(schema.resumeAnalyses)
      .orderBy(desc(schema.resumeAnalyses.createdAt))
      .limit(1)
      .get();

    // Saved jobs count
    const savedCount = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.savedJobs)
      .get();

    // Saved jobs by status
    const statusCounts = db
      .select({
        status: schema.savedJobs.status,
        count: sql<number>`count(*)`,
      })
      .from(schema.savedJobs)
      .groupBy(schema.savedJobs.status)
      .all();

    // Recent searches (last 5)
    const recentSearches = db
      .select()
      .from(schema.jobSearches)
      .orderBy(desc(schema.jobSearches.createdAt))
      .limit(5)
      .all();

    // Searches this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const searchesThisWeek = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobSearches)
      .where(gte(schema.jobSearches.createdAt, weekAgo.toISOString()))
      .get();

    // Total jobs found (all time)
    const totalJobs = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobResults)
      .get();

    // Top 5 saved jobs
    const recentSaved = db
      .select()
      .from(schema.savedJobs)
      .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
      .orderBy(desc(schema.savedJobs.createdAt))
      .limit(5)
      .all();

    // Check setup status
    const hasResume = db.select().from(schema.resumes).limit(1).get();
    const hasPreferences = db.select().from(schema.jobPreferences).limit(1).get();
    const hasSettings = db.select().from(schema.settings).limit(1).get();

    return NextResponse.json({
      resumeScore: latestAnalysis?.overallScore || null,
      savedJobsCount: savedCount?.count || 0,
      totalJobsFound: totalJobs?.count || 0,
      searchesThisWeek: searchesThisWeek?.count || 0,
      statusCounts: Object.fromEntries(
        statusCounts.map((s) => [s.status, s.count])
      ),
      recentSearches: recentSearches.map((s) => ({
        ...s,
        filters: JSON.parse(s.filters),
        providers: JSON.parse(s.providers),
      })),
      recentSaved: recentSaved.map((row) => ({
        ...row.saved_jobs,
        job: row.job_results,
      })),
      setup: {
        hasApiKeys: !!hasSettings,
        hasResume: !!hasResume,
        hasPreferences: !!hasPreferences,
        hasAnalysis: !!latestAnalysis,
        hasSearched: recentSearches.length > 0,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
