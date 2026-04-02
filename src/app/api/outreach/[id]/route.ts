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

    if (body.status) {
      updates.status = body.status;
      if (body.status === "sent" && !body.sentAt) {
        updates.sentAt = new Date().toISOString();
      }
      if (body.status === "replied" && !body.repliedAt) {
        updates.repliedAt = new Date().toISOString();
      }
    }
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.messageTemplate !== undefined) updates.messageTemplate = body.messageTemplate;
    if (body.followUpDate !== undefined) updates.followUpDate = body.followUpDate;
    if (body.channel) updates.channel = body.channel;
    if (body.sentAt) updates.sentAt = body.sentAt;
    if (body.repliedAt) updates.repliedAt = body.repliedAt;

    db.update(schema.outreachTracking)
      .set(updates)
      .where(eq(schema.outreachTracking.id, idNum))
      .run();

    const updated = db
      .select()
      .from(schema.outreachTracking)
      .where(eq(schema.outreachTracking.id, idNum))
      .get();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update outreach error:", error);
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

    db.delete(schema.outreachTracking)
      .where(eq(schema.outreachTracking.id, idNum))
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete outreach error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
