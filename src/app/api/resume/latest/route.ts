import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const resume = db
      .select()
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    if (!resume) {
      return NextResponse.json(null, { status: 404 });
    }

    const analyses = db
      .select()
      .from(schema.resumeAnalyses)
      .where(eq(schema.resumeAnalyses.resumeId, resume.id))
      .orderBy(desc(schema.resumeAnalyses.createdAt))
      .all();

    return NextResponse.json({ ...resume, analyses });
  } catch (error) {
    console.error("Get latest resume error:", error);
    return NextResponse.json({ error: "Failed to get resume" }, { status: 500 });
  }
}
