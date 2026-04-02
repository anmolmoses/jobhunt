import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";
import { JOB_MATCH_SYSTEM_PROMPT, JOB_MATCH_USER_PROMPT } from "@/lib/ai/prompts";

export async function POST(request: NextRequest) {
  try {
    const { jobs } = await request.json();

    if (!jobs?.length) {
      return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
    }

    // Get latest resume analysis for summary
    const analysis = db
      .select()
      .from(schema.resumeAnalyses)
      .orderBy(desc(schema.resumeAnalyses.createdAt))
      .limit(1)
      .get();

    if (!analysis) {
      return NextResponse.json({ error: "No resume analysis found" }, { status: 400 });
    }

    // Get resume text for context
    const resume = db
      .select()
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    const resumeSummary = `${analysis.summary}\n\nKey skills: ${JSON.parse(analysis.strengths).join(", ")}`;

    const aiProvider = await createAIProvider();

    // Process top jobs (limit to avoid API costs)
    const topJobs = jobs.slice(0, 10);
    const matches = [];

    for (const job of topJobs) {
      try {
        const rawResponse = await aiProvider.complete({
          messages: [
            { role: "system", content: JOB_MATCH_SYSTEM_PROMPT },
            {
              role: "user",
              content: JOB_MATCH_USER_PROMPT(
                resumeSummary,
                job.title,
                job.company,
                job.description || ""
              ),
            },
          ],
          maxTokens: 512,
          temperature: 0.2,
          responseFormat: "json",
        });

        let jsonStr = rawResponse.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        const matchData = JSON.parse(jsonStr);
        matches.push({
          externalId: job.externalId,
          ...matchData,
        });
      } catch {
        matches.push({
          externalId: job.externalId,
          matchScore: null,
          matchSummary: "Unable to analyze match",
          pros: [],
          cons: [],
        });
      }
    }

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Match analysis error:", error);
    return NextResponse.json({ error: "Failed to analyze matches" }, { status: 500 });
  }
}
