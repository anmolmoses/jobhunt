import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { parseIdParam } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const resume = db
      .select()
      .from(schema.resumes)
      .where(eq(schema.resumes.id, idNum))
      .get();

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    // Also fetch analyses
    const analyses = db
      .select()
      .from(schema.resumeAnalyses)
      .where(eq(schema.resumeAnalyses.resumeId, resume.id))
      .all();

    return NextResponse.json({ ...resume, analyses });
  } catch (error) {
    console.error("Get resume error:", error);
    return NextResponse.json({ error: "Failed to get resume" }, { status: 500 });
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

    const resume = db
      .select()
      .from(schema.resumes)
      .where(eq(schema.resumes.id, idNum))
      .get();

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), "uploads", resume.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from DB (cascade will remove analyses)
    db.delete(schema.resumes)
      .where(eq(schema.resumes.id, idNum))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete resume error:", error);
    return NextResponse.json({ error: "Failed to delete resume" }, { status: 500 });
  }
}
