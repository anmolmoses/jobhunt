import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { parseIdParam } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const build = db
      .select()
      .from(schema.resumeBuilds)
      .where(eq(schema.resumeBuilds.id, idNum))
      .get();

    if (!build) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...build,
      contactInfo: JSON.parse(build.contactInfo),
      experience: JSON.parse(build.experience),
      education: JSON.parse(build.education),
      skills: JSON.parse(build.skills),
      projects: JSON.parse(build.projects),
      certifications: JSON.parse(build.certifications),
      customSections: JSON.parse(build.customSections),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get resume" }, { status: 500 });
  }
}

export async function PUT(
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

    if (body.name !== undefined) updates.name = body.name;
    if (body.contactInfo !== undefined) updates.contactInfo = JSON.stringify(body.contactInfo);
    if (body.summary !== undefined) updates.summary = body.summary;
    if (body.experience !== undefined) updates.experience = JSON.stringify(body.experience);
    if (body.education !== undefined) updates.education = JSON.stringify(body.education);
    if (body.skills !== undefined) updates.skills = JSON.stringify(body.skills);
    if (body.projects !== undefined) updates.projects = JSON.stringify(body.projects);
    if (body.certifications !== undefined) updates.certifications = JSON.stringify(body.certifications);
    if (body.customSections !== undefined) updates.customSections = JSON.stringify(body.customSections);

    db.update(schema.resumeBuilds)
      .set(updates)
      .where(eq(schema.resumeBuilds.id, idNum))
      .run();

    const updated = db
      .select()
      .from(schema.resumeBuilds)
      .where(eq(schema.resumeBuilds.id, idNum))
      .get();

    return NextResponse.json(updated);
  } catch (error) {
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

    db.delete(schema.resumeBuilds)
      .where(eq(schema.resumeBuilds.id, idNum))
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
