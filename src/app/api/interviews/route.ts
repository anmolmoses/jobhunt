import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { recordAction } from "@/lib/gamification";
import { triggerGoogleSheetsSync } from "@/lib/sheets/sync";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.savedJobId) {
      return NextResponse.json({ error: "savedJobId is required" }, { status: 400 });
    }

    const interview = db
      .insert(schema.interviews)
      .values({
        savedJobId: body.savedJobId,
        type: body.type || "other",
        scheduledAt: body.scheduledAt || null,
        duration: body.duration || null,
        interviewerName: body.interviewerName || null,
        interviewerTitle: body.interviewerTitle || null,
        meetingLink: body.meetingLink || null,
        notes: body.notes || null,
        prepNotes: body.prepNotes || null,
        outcome: "pending",
      })
      .returning()
      .get();

    // Log activity
    db.insert(schema.activityLog)
      .values({
        savedJobId: body.savedJobId,
        type: "interview_scheduled",
        title: `${body.type || "Interview"} scheduled`,
        description: body.scheduledAt
          ? `Scheduled for ${new Date(body.scheduledAt).toLocaleString()}`
          : "Date TBD",
      })
      .run();

    // Auto-update saved job status to interviewing
    db.update(schema.savedJobs)
      .set({ status: "interviewing", updatedAt: new Date().toISOString() })
      .where(eq(schema.savedJobs.id, body.savedJobId))
      .run();

    try { recordAction("interview", { savedJobId: body.savedJobId }); } catch (e) { console.error("Gamification error:", e); }
    try { triggerGoogleSheetsSync(); } catch (e) { console.error("Sheets sync error:", e); }

    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    console.error("Create interview error:", error);
    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
}
