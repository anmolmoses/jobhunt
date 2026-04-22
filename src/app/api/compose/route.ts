import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";
import { scrapeJobDescription } from "@/lib/firecrawl/client";
import { getSetting } from "@/lib/settings";

const SYSTEM_PROMPT = `You are an expert career coach who writes short, high-signal LinkedIn outreach messages for job seekers.

You will receive:
- A candidate resume (to ground the "fit" claim — never fabricate)
- A job opening (from a URL scrape, pasted description, or screenshot)

You produce TWO messages:
1. **referralMessage** — sent to an EMPLOYEE at the target company asking for a referral for the listed opening
2. **recruiterMessage** — sent to a RECRUITER at the target company pitching yourself for the listed opening

Framework for both:
- ≤ 300 characters (LinkedIn connection-request limit)
- 3–4 sentences max
- Sentence 1: specific hook (the role by name + the company), no generic opener
- Sentence 2: one concrete fit line grounded in the resume (years, tech, a shipped outcome)
- Sentence 3: low-friction ask — referral ask for employees; short intro chat / resume review for recruiters
- "I'm choosing you" tone — confident, not desperate
- NEVER: "pick your brain", "hope this finds you well", "I'd love to", "just wanted to"
- NEVER fabricate experience. Only use what's in the resume.
- Leave a literal \`[Name]\` token where the recipient's first name should go — the user will fill it in.

You MUST respond with valid JSON only. No markdown fences, no prose.

Response format:
{
  "jobTitle": "<the role title you extracted from the job info>",
  "company": "<the company name you extracted>",
  "referralMessage": "<message to an employee asking for a referral, <=300 chars>",
  "recruiterMessage": "<message to a recruiter pitching yourself, <=300 chars>",
  "fitSummary": "<one sentence on why the candidate is a strong fit — used as a subtitle in the UI>"
}`;

async function loadResumeText(): Promise<string | null> {
  const resume = db
    .select()
    .from(schema.resumes)
    .orderBy(desc(schema.resumes.createdAt))
    .limit(1)
    .get();
  return resume?.parsedText || null;
}

interface ComposeBody {
  url?: string;
  description?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

async function generateWithImage(
  resumeText: string,
  imageBase64: string,
  imageMimeType: string,
  extraContext: string,
): Promise<string> {
  const apiKey = await getSetting("anthropic_api_key");
  if (!apiKey) {
    throw new Error(
      "Screenshot input requires an Anthropic API key. Paste the job as text or URL, or add a Claude key in Settings.",
    );
  }
  const savedModel = await getSetting("claude_model");
  const model = savedModel || "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0.5,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `## My Resume:\n${resumeText.slice(0, 2500)}\n\n## Target Job:\nThe job is shown in the attached screenshot.${extraContext ? `\n\nAdditional notes: ${extraContext.slice(0, 500)}` : ""}`,
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageBase64,
            },
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

export async function POST(request: NextRequest) {
  try {
    const body: ComposeBody = await request.json();
    const { url, description, imageBase64, imageMimeType } = body;

    if (!url && !description && !imageBase64) {
      return NextResponse.json(
        { error: "Provide a job URL, a description, or a screenshot." },
        { status: 400 },
      );
    }

    const resumeText = await loadResumeText();
    if (!resumeText) {
      return NextResponse.json(
        { error: "No resume found. Upload a resume first so we can ground the fit line." },
        { status: 400 },
      );
    }

    // Resolve job source into text we can feed the model.
    let jobContext = "";
    let sourceLabel = "";

    if (url) {
      const scraped = await scrapeJobDescription(url);
      if (!scraped) {
        return NextResponse.json(
          {
            error:
              "Could not scrape that URL. Firecrawl may not be configured — paste the description text instead.",
          },
          { status: 400 },
        );
      }
      jobContext = scraped;
      sourceLabel = url;
    } else if (description) {
      jobContext = description;
      sourceLabel = "pasted description";
    }

    let rawResponse: string;

    if (imageBase64) {
      rawResponse = await generateWithImage(
        resumeText,
        imageBase64,
        imageMimeType || "image/png",
        jobContext,
      );
    } else {
      const aiProvider = await createAIProvider();
      rawResponse = await aiProvider.complete({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `## My Resume:\n${resumeText.slice(0, 2500)}\n\n## Target Job (source: ${sourceLabel}):\n${jobContext.slice(0, 5000)}`,
          },
        ],
        maxTokens: 1024,
        temperature: 0.5,
        responseFormat: "json",
      });
    }

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    return NextResponse.json({
      jobTitle: parsed.jobTitle || "",
      company: parsed.company || "",
      referralMessage: parsed.referralMessage || "",
      recruiterMessage: parsed.recruiterMessage || "",
      fitSummary: parsed.fitSummary || "",
    });
  } catch (error) {
    console.error("Compose error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compose messages" },
      { status: 500 },
    );
  }
}
