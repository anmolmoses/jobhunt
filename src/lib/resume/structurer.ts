import { createAIProvider } from "@/lib/ai/provider";
import { RESUME_STRUCTURE_SYSTEM_PROMPT, RESUME_STRUCTURE_USER_PROMPT } from "@/lib/ai/prompts";
import type { ResumeData } from "./pdf-generator";

const EMPTY_RESUME: ResumeData = {
  contactInfo: {},
  summary: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  customSections: [],
};

/**
 * Use AI to parse raw resume text into structured JSON sections.
 * Returns typed ResumeData ready for the builder and PDF generator.
 */
export async function structureResume(parsedText: string): Promise<ResumeData> {
  if (!parsedText || parsedText.trim().length < 50) {
    return EMPTY_RESUME;
  }

  try {
    const aiProvider = await createAIProvider();
    const response = await aiProvider.complete({
      messages: [
        { role: "system", content: RESUME_STRUCTURE_SYSTEM_PROMPT },
        { role: "user", content: RESUME_STRUCTURE_USER_PROMPT(parsedText.slice(0, 8000)) },
      ],
      maxTokens: 4096,
      temperature: 0.1,
      responseFormat: "json",
    });

    let jsonStr = response.trim();
    // Strip markdown code fences if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and normalize the structure
    return {
      contactInfo: parsed.contactInfo || {},
      summary: parsed.summary || "",
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      customSections: Array.isArray(parsed.customSections) ? parsed.customSections : [],
    };
  } catch (error) {
    console.error("Resume structuring failed:", error);
    return EMPTY_RESUME;
  }
}
