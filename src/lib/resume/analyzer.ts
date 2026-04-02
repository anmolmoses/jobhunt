import { createAIProvider } from "@/lib/ai/provider";
import {
  RESUME_ANALYSIS_SYSTEM_PROMPT,
  RESUME_ANALYSIS_USER_PROMPT,
} from "@/lib/ai/prompts";
import type { ResumeAnalysis } from "@/types/ai";

export async function analyzeResume(resumeText: string): Promise<{
  analysis: ResumeAnalysis;
  rawResponse: string;
  provider: string;
}> {
  const aiProvider = await createAIProvider();

  const rawResponse = await aiProvider.complete({
    messages: [
      { role: "system", content: RESUME_ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: RESUME_ANALYSIS_USER_PROMPT(resumeText) },
    ],
    maxTokens: 4096,
    temperature: 0.3,
    responseFormat: "json",
  });

  // Parse JSON with repair for truncated responses
  const { parseAiJson } = await import("@/lib/ai/json-repair");
  const analysis: ResumeAnalysis = parseAiJson(rawResponse);

  // Validate scores are within range
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  analysis.overallScore = clamp(analysis.overallScore);
  analysis.formattingScore = clamp(analysis.formattingScore);
  analysis.contentScore = clamp(analysis.contentScore);
  analysis.keywordScore = clamp(analysis.keywordScore);
  analysis.atsScore = clamp(analysis.atsScore);

  return {
    analysis,
    rawResponse,
    provider: aiProvider.name,
  };
}
