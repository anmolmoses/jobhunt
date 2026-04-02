import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, sql, gte } from "drizzle-orm";

export async function GET() {
  try {
    // Get all saved jobs with their job details
    const savedJobs = db
      .select()
      .from(schema.savedJobs)
      .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
      .orderBy(desc(schema.savedJobs.updatedAt))
      .all();

    const pipeline = savedJobs.map((row) => ({
      ...row.saved_jobs,
      job: {
        ...row.job_results,
        tags: JSON.parse(row.job_results.tags || "[]"),
      },
    }));

    // Get interviews
    const allInterviews = db
      .select()
      .from(schema.interviews)
      .orderBy(desc(schema.interviews.scheduledAt))
      .all();

    // Get recent activity
    const recentActivity = db
      .select()
      .from(schema.activityLog)
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(50)
      .all();

    // Pipeline stats
    const statusCounts: Record<string, number> = {};
    for (const item of pipeline) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }

    // Follow-ups due (saved jobs with follow_up_date <= today)
    const today = new Date().toISOString().split("T")[0];
    const followUpsDue = pipeline.filter(
      (item) => item.followUpDate && item.followUpDate <= today
    );

    // Upcoming interviews (scheduled in the future)
    const now = new Date().toISOString();
    const upcomingInterviews = allInterviews.filter(
      (i) => i.scheduledAt && i.scheduledAt >= now && i.outcome === "pending"
    );

    // Response rate
    const appliedCount = pipeline.filter((p) =>
      ["applied", "interviewing", "offered", "rejected"].includes(p.status)
    ).length;
    const responseCount = pipeline.filter((p) =>
      ["interviewing", "offered", "rejected"].includes(p.status)
    ).length;
    const responseRate = appliedCount > 0 ? Math.round((responseCount / appliedCount) * 100) : 0;

    return NextResponse.json({
      pipeline,
      interviews: allInterviews,
      activity: recentActivity,
      stats: {
        total: pipeline.length,
        ...statusCounts,
        responseRate,
        followUpsDue: followUpsDue.length,
        upcomingInterviews: upcomingInterviews.length,
      },
      followUpsDue,
      upcomingInterviews,
    });
  } catch (error) {
    console.error("Tracker error:", error);
    return NextResponse.json({ error: "Failed to load tracker data" }, { status: 500 });
  }
}
