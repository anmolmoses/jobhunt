import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { analyzeResume } from "@/lib/resume/analyzer";

export async function POST(request: NextRequest) {
  try {
    const { resumeId } = await request.json();

    if (!resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    const resume = db
      .select()
      .from(schema.resumes)
      .where(eq(schema.resumes.id, resumeId))
      .get();

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    if (!resume.parsedText) {
      return NextResponse.json({ error: "Resume has no parsed text" }, { status: 422 });
    }

    const { analysis, rawResponse, provider } = await analyzeResume(resume.parsedText);

    const result = db
      .insert(schema.resumeAnalyses)
      .values({
        resumeId: resume.id,
        aiProvider: provider,
        overallScore: analysis.overallScore,
        formattingScore: analysis.formattingScore,
        contentScore: analysis.contentScore,
        keywordScore: analysis.keywordScore,
        atsScore: analysis.atsScore,
        summary: analysis.summary,
        strengths: JSON.stringify(analysis.strengths),
        improvements: JSON.stringify(analysis.improvements),
        toRemove: JSON.stringify(analysis.toRemove),
        toAdd: JSON.stringify(analysis.toAdd),
        detailedFeedback: analysis.detailedFeedback,
        rawResponse,
      })
      .returning()
      .get();

    return NextResponse.json({
      ...result,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      toRemove: analysis.toRemove,
      toAdd: analysis.toAdd,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
