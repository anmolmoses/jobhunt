import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { recordAction } from "@/lib/gamification";

export async function GET() {
  try {
    const saved = db
      .select()
      .from(schema.savedJobs)
      .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
      .orderBy(desc(schema.savedJobs.createdAt))
      .all();

    return NextResponse.json(
      saved.map((row) => ({
        ...row.saved_jobs,
        job: {
          ...row.job_results,
          tags: JSON.parse(row.job_results.tags || "[]"),
        },
      }))
    );
  } catch (error) {
    console.error("Get saved jobs error:", error);
    return NextResponse.json({ error: "Failed to get saved jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { jobResultId, notes } = await request.json();

    if (!jobResultId) {
      return NextResponse.json({ error: "jobResultId is required" }, { status: 400 });
    }

    // Check if already saved
    const existing = db
      .select()
      .from(schema.savedJobs)
      .where(eq(schema.savedJobs.jobResultId, jobResultId))
      .get();

    if (existing) {
      return NextResponse.json({ error: "Job already saved" }, { status: 409 });
    }

    const result = db
      .insert(schema.savedJobs)
      .values({
        jobResultId,
        notes: notes || null,
        status: "saved",
      })
      .returning()
      .get();

    try { recordAction("save_job", { jobResultId }); } catch (e) { console.error("Gamification error:", e); }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Save job error:", error);
    return NextResponse.json({ error: "Failed to save job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { jobResultId } = await request.json();

    if (!jobResultId || typeof jobResultId !== "number") {
      return NextResponse.json({ error: "Valid jobResultId is required" }, { status: 400 });
    }

    db.delete(schema.savedJobs)
      .where(eq(schema.savedJobs.jobResultId, jobResultId))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsave job error:", error);
    return NextResponse.json({ error: "Failed to unsave job" }, { status: 500 });
  }
}
