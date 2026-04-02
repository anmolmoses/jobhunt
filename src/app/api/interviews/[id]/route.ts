import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { parseIdParam } from "@/lib/utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await request.json();

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.type) updates.type = body.type;
    if (body.scheduledAt !== undefined) updates.scheduledAt = body.scheduledAt;
    if (body.duration !== undefined) updates.duration = body.duration;
    if (body.interviewerName !== undefined) updates.interviewerName = body.interviewerName;
    if (body.interviewerTitle !== undefined) updates.interviewerTitle = body.interviewerTitle;
    if (body.meetingLink !== undefined) updates.meetingLink = body.meetingLink;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.prepNotes !== undefined) updates.prepNotes = body.prepNotes;
    if (body.feedback !== undefined) updates.feedback = body.feedback;

    if (body.outcome) {
      updates.outcome = body.outcome;

      // Log outcome
      const interview = db.select().from(schema.interviews).where(eq(schema.interviews.id, idNum)).get();
      if (interview) {
        db.insert(schema.activityLog)
          .values({
            savedJobId: interview.savedJobId,
            type: body.outcome === "passed" ? "interview_passed" : body.outcome === "failed" ? "interview_failed" : "interview_updated",
            title: `Interview ${body.outcome}`,
            description: body.feedback || null,
          })
          .run();
      }
    }

    db.update(schema.interviews)
      .set(updates)
      .where(eq(schema.interviews.id, idNum))
      .run();

    const updated = db.select().from(schema.interviews).where(eq(schema.interviews.id, idNum)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update interview error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    db.delete(schema.interviews).where(eq(schema.interviews.id, idNum)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
