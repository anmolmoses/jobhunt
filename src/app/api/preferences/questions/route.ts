import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";
import {
  PREFERENCE_QUESTIONS_SYSTEM_PROMPT,
  PREFERENCE_QUESTIONS_USER_PROMPT,
} from "@/lib/ai/prompts";

/**
 * Attempt to repair truncated JSON by closing open strings, arrays, and objects.
 */
function repairJson(str: string): string {
  let s = str.trim();

  // Strip markdown code fences
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // If it already parses, return as-is
  try {
    JSON.parse(s);
    return s;
  } catch {
    // Continue to repair
  }

  // Close unterminated strings
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    s += '"';
  }

  // Try to close arrays and objects
  const opens = { "{": 0, "[": 0 };
  const closes: Record<string, keyof typeof opens> = { "}": "{", "]": "[" };
  let inString = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") opens[ch]++;
    if (ch === "}" || ch === "]") opens[closes[ch]]--;
  }

  // Remove trailing comma before closing
  s = s.replace(/,\s*$/, "");

  // Close remaining open brackets
  for (let i = 0; i < opens["["]; i++) s += "]";
  for (let i = 0; i < opens["{"]; i++) s += "}";

  return s;
}

export async function POST() {
  try {
    const resume = db
      .select()
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    if (!resume?.parsedText) {
      return NextResponse.json(
        { error: "Please upload a resume first" },
        { status: 400 }
      );
    }

    const aiProvider = await createAIProvider();

    const rawResponse = await aiProvider.complete({
      messages: [
        { role: "system", content: PREFERENCE_QUESTIONS_SYSTEM_PROMPT },
        {
          role: "user",
          content: PREFERENCE_QUESTIONS_USER_PROMPT(resume.parsedText),
        },
      ],
      maxTokens: 8192, // Increased — the questionnaire prompt is detailed
      temperature: 0.5,
      responseFormat: "json",
    });

    // Repair potentially truncated JSON
    const repaired = repairJson(rawResponse);

    try {
      const data = JSON.parse(repaired);
      return NextResponse.json(data);
    } catch {
      // If repair didn't work, try to extract partial questions
      const match = repaired.match(/"questions"\s*:\s*\[([\s\S]*)/);
      if (match) {
        try {
          const partial = JSON.parse(`{"questions":[${match[1]}`);
          if (partial.questions?.length > 0) {
            return NextResponse.json(partial);
          }
        } catch {
          // Give up
        }
      }
      throw new Error("AI returned invalid JSON. Try again — the response was likely cut off.");
    }
  } catch (error) {
    console.error("Generate questions error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate questions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
