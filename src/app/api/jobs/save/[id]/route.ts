import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { parseIdParam } from "@/lib/utils";
import { recordAction } from "@/lib/gamification";
import { triggerGoogleSheetsSync } from "@/lib/sheets/sync";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await request.json();
    const savedJobId = idNum;

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    const oldJob = db.select().from(schema.savedJobs).where(eq(schema.savedJobs.id, savedJobId)).get();

    if (body.status) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.appliedAt !== undefined) updates.appliedAt = body.appliedAt;
    if (body.followUpDate !== undefined) updates.followUpDate = body.followUpDate;
    if (body.nextStep !== undefined) updates.nextStep = body.nextStep;

    // Auto-set appliedAt when status changes to "applied"
    if (body.status === "applied" && !body.appliedAt) {
      updates.appliedAt = new Date().toISOString();
    }

    // Auto-set follow-up date (7 days from now) when applying
    if (body.status === "applied" && !body.followUpDate) {
      const followUp = new Date();
      followUp.setDate(followUp.getDate() + 7);
      updates.followUpDate = followUp.toISOString().split("T")[0];
    }

    db.update(schema.savedJobs)
      .set(updates)
      .where(eq(schema.savedJobs.id, savedJobId))
      .run();

    // Award gamification XP on apply
    if (body.status === "applied" && oldJob?.status !== "applied") {
      try { recordAction("apply", { savedJobId }); } catch (e) { console.error("Gamification error:", e); }
    }

    // Log activity on status change
    if (body.status && oldJob && body.status !== oldJob.status) {
      const titles: Record<string, string> = {
        saved: "Job saved",
        applied: "Application submitted",
        interviewing: "Moved to interviewing",
        offered: "Offer received!",
        rejected: "Application rejected",
      };
      db.insert(schema.activityLog)
        .values({
          savedJobId,
          type: body.status === "applied" ? "applied" : body.status === "offered" ? "offer_received" : "status_change",
          title: titles[body.status] || `Status changed to ${body.status}`,
          description: body.notes || null,
        })
        .run();
    }

    // Log follow-up set
    if (body.followUpDate && body.followUpDate !== oldJob?.followUpDate) {
      db.insert(schema.activityLog)
        .values({
          savedJobId,
          type: "follow_up_set",
          title: `Follow-up scheduled for ${body.followUpDate}`,
        })
        .run();
    }

    const updated = db.select().from(schema.savedJobs).where(eq(schema.savedJobs.id, savedJobId)).get();

    try { triggerGoogleSheetsSync(); } catch (e) { console.error("Sheets sync error:", e); }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update saved job error:", error);
    return NextResponse.json({ error: "Failed to update saved job" }, { status: 500 });
  }
}
