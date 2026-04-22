import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await request.json();

    const allowed = [
      "jobTitle",
      "company",
      "fitSummary",
      "referralMessage",
      "recruiterMessage",
    ] as const;

    const updates: Partial<Record<(typeof allowed)[number], string | null>> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const updated = db
      .update(schema.composeDrafts)
      .set({ ...updates, updatedAt: sql`(datetime('now'))` })
      .where(eq(schema.composeDrafts.id, id))
      .returning()
      .get();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Patch draft error:", error);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    db.delete(schema.composeDrafts).where(eq(schema.composeDrafts.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete draft error:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
