import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";
import { scrapeJobDescription } from "@/lib/firecrawl/client";
import { getAIProvider, getSetting } from "@/lib/settings";

export const SYSTEM_PROMPT = `You are an expert career coach who writes short, high-signal LinkedIn outreach messages for job seekers.

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

type VisionMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function coerceMime(mime: string | undefined): VisionMime {
  const m = (mime || "image/png").toLowerCase();
  if (m === "image/jpeg" || m === "image/png" || m === "image/gif" || m === "image/webp") return m;
  return "image/png";
}

async function generateWithClaudeVision(
  resumeText: string,
  imageBase64: string,
  mime: VisionMime,
  extraContext: string,
): Promise<string> {
  const apiKey = await getSetting("anthropic_api_key");
  if (!apiKey) throw new Error("Anthropic API key not configured");
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
            source: { type: "base64", media_type: mime, data: imageBase64 },
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

async function generateWithOpenAIVision(
  resumeText: string,
  imageBase64: string,
  mime: VisionMime,
  extraContext: string,
): Promise<string> {
  const apiKey = await getSetting("openai_api_key");
  if (!apiKey) throw new Error("OpenAI API key not configured");
  const savedModel = await getSetting("openai_model");
  // Vision support: gpt-4o family and gpt-4-turbo. Default to gpt-4o.
  const model = savedModel && /4o|4-turbo|gpt-5/i.test(savedModel) ? savedModel : "gpt-4o";
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: 1024,
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `## My Resume:\n${resumeText.slice(0, 2500)}\n\n## Target Job:\nThe job is shown in the attached screenshot.${extraContext ? `\n\nAdditional notes: ${extraContext.slice(0, 500)}` : ""}`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${imageBase64}` },
          },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

async function generateWithImage(
  resumeText: string,
  imageBase64: string,
  mime: VisionMime,
  extraContext: string,
): Promise<string> {
  const preferred = await getAIProvider();
  const claudeKey = await getSetting("anthropic_api_key");
  const openaiKey = await getSetting("openai_api_key");

  if (preferred === "openai") {
    if (openaiKey) return generateWithOpenAIVision(resumeText, imageBase64, mime, extraContext);
    if (claudeKey) return generateWithClaudeVision(resumeText, imageBase64, mime, extraContext);
  } else {
    if (claudeKey) return generateWithClaudeVision(resumeText, imageBase64, mime, extraContext);
    if (openaiKey) return generateWithOpenAIVision(resumeText, imageBase64, mime, extraContext);
  }
  throw new Error(
    "Screenshot input needs a Claude or OpenAI API key. Paste the job as text or URL, or add a key in Settings.",
  );
}

export async function GET() {
  try {
    const drafts = db
      .select()
      .from(schema.composeDrafts)
      .orderBy(desc(schema.composeDrafts.createdAt))
      .limit(50)
      .all();
    return NextResponse.json(drafts);
  } catch (error) {
    console.error("List drafts error:", error);
    return NextResponse.json({ error: "Failed to list drafts" }, { status: 500 });
  }
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

    let jobContext = "";
    let sourceLabel = "";
    let sourceType: "url" | "text" | "image" = "text";

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
      sourceType = "url";
    } else if (description) {
      jobContext = description;
      sourceLabel = "pasted description";
      sourceType = "text";
    } else if (imageBase64) {
      sourceType = "image";
    }

    let rawResponse: string;

    if (imageBase64) {
      rawResponse = await generateWithImage(
        resumeText,
        imageBase64,
        coerceMime(imageMimeType),
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

    const draft = db
      .insert(schema.composeDrafts)
      .values({
        sourceType,
        sourceUrl: url || null,
        jobTitle: parsed.jobTitle || null,
        company: parsed.company || null,
        fitSummary: parsed.fitSummary || null,
        referralMessage: parsed.referralMessage || null,
        recruiterMessage: parsed.recruiterMessage || null,
      })
      .returning()
      .get();

    return NextResponse.json({
      id: draft.id,
      jobTitle: draft.jobTitle || "",
      company: draft.company || "",
      referralMessage: draft.referralMessage || "",
      recruiterMessage: draft.recruiterMessage || "",
      fitSummary: draft.fitSummary || "",
      savedJobId: draft.savedJobId,
      createdAt: draft.createdAt,
    });
  } catch (error) {
    console.error("Compose error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compose messages" },
      { status: 500 },
    );
  }
}
