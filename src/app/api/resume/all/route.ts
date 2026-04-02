import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const resumes = db
      .select()
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .all();

    // Get latest analysis for each resume
    const result = resumes.map((resume) => {
      const analysis = db
        .select()
        .from(schema.resumeAnalyses)
        .where(eq(schema.resumeAnalyses.resumeId, resume.id))
        .orderBy(desc(schema.resumeAnalyses.createdAt))
        .limit(1)
        .get();

      return {
        ...resume,
        analysis: analysis
          ? {
              ...analysis,
              strengths: JSON.parse(analysis.strengths),
              improvements: JSON.parse(analysis.improvements),
              toRemove: JSON.parse(analysis.toRemove),
              toAdd: JSON.parse(analysis.toAdd),
            }
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get all resumes error:", error);
    return NextResponse.json({ error: "Failed to get resumes" }, { status: 500 });
  }
}
