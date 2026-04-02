import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";
import { parseAiJson } from "@/lib/ai/json-repair";
import {
  RESUME_TAILOR_SYSTEM_PROMPT,
  RESUME_TAILOR_USER_PROMPT,
} from "@/lib/ai/prompts";

export async function POST(request: NextRequest) {
  try {
    const { resumeBuildId, jobResultId } = await request.json();

    // Get the resume build
    let resumeContent = "";

    if (resumeBuildId) {
      // Use a specific resume build
      const build = db
        .select()
        .from(schema.resumeBuilds)
        .where(eq(schema.resumeBuilds.id, resumeBuildId))
        .get();

      if (!build) {
        return NextResponse.json({ error: "Resume build not found" }, { status: 404 });
      }

      const contact = JSON.parse(build.contactInfo);
      const experience = JSON.parse(build.experience);
      const skills = JSON.parse(build.skills);

      // Flatten resume into text for AI
      resumeContent = `Name: ${contact.name || ""}\nSummary: ${build.summary || ""}\n\n`;
      resumeContent += "Experience:\n";
      for (const exp of experience) {
        resumeContent += `- ${exp.title} at ${exp.company} (${exp.startDate} - ${exp.endDate || "Present"})\n`;
        resumeContent += `  ${exp.description?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || ""}\n\n`;
      }
      resumeContent += "Skills:\n";
      for (const cat of skills) {
        resumeContent += `- ${cat.category}: ${(cat.items || []).join(", ")}\n`;
      }
    } else {
      // Use the uploaded resume's parsed text
      const resume = db
        .select()
        .from(schema.resumes)
        .orderBy(desc(schema.resumes.createdAt))
        .limit(1)
        .get();

      if (!resume?.parsedText) {
        return NextResponse.json({ error: "No resume found. Upload one or create one in Resume Builder." }, { status: 400 });
      }
      resumeContent = resume.parsedText;
    }

    // Get the job
    if (!jobResultId) {
      return NextResponse.json({ error: "jobResultId is required" }, { status: 400 });
    }

    const job = db
      .select()
      .from(schema.jobResults)
      .where(eq(schema.jobResults.id, jobResultId))
      .get();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job.description) {
      return NextResponse.json({ error: "This job has no description to tailor against. Try a job with a full description." }, { status: 400 });
    }

    // Call AI
    const aiProvider = await createAIProvider();
    const rawResponse = await aiProvider.complete({
      messages: [
        { role: "system", content: RESUME_TAILOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: RESUME_TAILOR_USER_PROMPT(
            resumeContent,
            job.title,
            job.company,
            job.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000)
          ),
        },
      ],
      maxTokens: 8192,
      temperature: 0.3,
      responseFormat: "json",
    });

    const tailored = parseAiJson(rawResponse);

    return NextResponse.json({
      tailored,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
      },
    });
  } catch (error) {
    console.error("Resume tailor error:", error);
    const message = error instanceof Error ? error.message : "Failed to tailor resume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
