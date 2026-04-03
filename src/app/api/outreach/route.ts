import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { recordAction } from "@/lib/gamification";

// GET all outreach records
export async function GET() {
  try {
    const records = db
      .select()
      .from(schema.outreachTracking)
      .innerJoin(
        schema.networkContacts,
        eq(schema.outreachTracking.contactId, schema.networkContacts.id)
      )
      .orderBy(desc(schema.outreachTracking.updatedAt))
      .all();

    return NextResponse.json(
      records.map((r) => ({
        ...r.outreach_tracking,
        contact: r.network_contacts,
      }))
    );
  } catch (error) {
    console.error("Get outreach error:", error);
    return NextResponse.json({ error: "Failed to get outreach records" }, { status: 500 });
  }
}

// POST create new outreach record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    const record = db
      .insert(schema.outreachTracking)
      .values({
        contactId: body.contactId,
        savedJobId: body.savedJobId || null,
        channel: body.channel || "linkedin",
        status: body.status || "planned",
        messageTemplate: body.messageTemplate || null,
        notes: body.notes || null,
        sentAt: body.status === "sent" ? new Date().toISOString() : null,
        followUpDate: body.followUpDate || null,
      })
      .returning()
      .get();

    try { recordAction("outreach", { contactId: body.contactId }); } catch (e) { console.error("Gamification error:", e); }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Create outreach error:", error);
    return NextResponse.json({ error: "Failed to create outreach record" }, { status: 500 });
  }
}
