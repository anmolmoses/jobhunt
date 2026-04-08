import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";

const APPLICATION_ASSIST_SYSTEM_PROMPT = `You are an expert job application writer. Given a candidate's resume and a target job, generate personalized application answers.

Your tone framework:
- Confident without arrogance
- Selective without hubris — "I'm choosing you" energy
- Specific and concrete — reference actual experience
- Direct, no fluff — every sentence adds value

You MUST respond with valid JSON only. No markdown, no code blocks.

Response format:
{
  "coverLetterDraft": "<3-4 paragraph cover letter tailored to this specific job. Reference specific requirements from the JD and match them to the candidate's experience>",
  "whyThisRole": "<2-3 sentences answering 'Why are you interested in this role?'>",
  "whyThisCompany": "<2-3 sentences answering 'Why do you want to work at this company?'>",
  "biggestStrength": "<2-3 sentences on biggest relevant strength with a concrete example>",
  "challengeOvercome": "<2-3 sentences about a relevant challenge overcome>",
  "whatYouBring": "<2-3 sentences on unique value proposition — what sets you apart>",
  "salaryExpectation": "<1 sentence with a suggested range based on market data and experience level>",
  "additionalNotes": "<anything else relevant — availability, visa status notes, etc.>"
}

Rules:
- NEVER fabricate experience. Only reference what's actually in the resume.
- DO reformulate existing experience using the JD's vocabulary and keywords.
- Match the company's tone — startup = casual/energetic, enterprise = professional/measured.
- Focus on IMPACT and RESULTS, not just responsibilities.`;

const OUTREACH_SYSTEM_PROMPT = `You are an expert at LinkedIn networking and outreach. Generate personalized connection messages for reaching out to people at a target company about a job opportunity.

You MUST respond with valid JSON only.

Response format:
{
  "hiringManagerMessage": "<LinkedIn connection request message, MAX 300 characters. 3-sentence framework: 1) Specific hook about their work/company 2) Your relevant value 3) Soft ask>",
  "recruiterMessage": "<LinkedIn connection request message, MAX 300 characters. Direct, mention the specific role, highlight match>",
  "peerMessage": "<LinkedIn connection request message, MAX 300 characters. Collegial tone, mention shared interests/tech, ask about team culture>",
  "followUpEmail": "<Short email (5-7 sentences) to send after connecting. Reference the conversation, reiterate interest, include one specific value-add>",
  "searchQueries": ["<LinkedIn search query to find hiring manager>", "<query to find recruiter>", "<query to find team lead>"]
}

Rules:
- Messages MUST be under 300 characters (LinkedIn limit for connection requests)
- Be specific — reference actual company/role details, not generic templates
- Never be desperate or generic ("I'd love to pick your brain" = banned)
- Project "I'm choosing you" energy — you're evaluating them too`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, jobTitle, company, location, description } = body;

    if (!jobTitle || !company) {
      return NextResponse.json({ error: "jobTitle and company required" }, { status: 400 });
    }

    // Load resume
    const resume = db.select().from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    if (!resume?.parsedText) {
      return NextResponse.json({ error: "No resume found" }, { status: 400 });
    }

    const aiProvider = await createAIProvider();

    if (type === "outreach") {
      const rawResponse = await aiProvider.complete({
        messages: [
          { role: "system", content: OUTREACH_SYSTEM_PROMPT },
          {
            role: "user",
            content: `## My Resume:\n${resume.parsedText.slice(0, 2000)}\n\n## Target:\n**${jobTitle}** at **${company}**\nLocation: ${location || "Not specified"}\n\n${(description || "").slice(0, 2000)}`,
          },
        ],
        maxTokens: 1024,
        temperature: 0.5,
        responseFormat: "json",
      });

      let jsonStr = rawResponse.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      return NextResponse.json(JSON.parse(jsonStr));
    }

    // Default: application assist
    const rawResponse = await aiProvider.complete({
      messages: [
        { role: "system", content: APPLICATION_ASSIST_SYSTEM_PROMPT },
        {
          role: "user",
          content: `## My Resume:\n${resume.parsedText.slice(0, 3000)}\n\n## Target Job:\n**${jobTitle}** at **${company}**\nLocation: ${location || "Not specified"}\n\n${(description || "").slice(0, 3000)}`,
        },
      ],
      maxTokens: 2048,
      temperature: 0.4,
      responseFormat: "json",
    });

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    return NextResponse.json(JSON.parse(jsonStr));
  } catch (error) {
    console.error("Application assist error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
