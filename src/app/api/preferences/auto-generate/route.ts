import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";
import {
  AUTO_EXTRACT_PREFERENCES_SYSTEM_PROMPT,
  AUTO_EXTRACT_PREFERENCES_USER_PROMPT,
} from "@/lib/ai/prompts";

export async function POST() {
  try {
    // Get latest resume
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
        { role: "system", content: AUTO_EXTRACT_PREFERENCES_SYSTEM_PROMPT },
        { role: "user", content: AUTO_EXTRACT_PREFERENCES_USER_PROMPT(resume.parsedText) },
      ],
      maxTokens: 2048,
      temperature: 0.3,
      responseFormat: "json",
    });

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const extracted = JSON.parse(jsonStr);

    // Save preferences to DB
    const values = {
      desiredRoles: JSON.stringify(extracted.desiredRoles || []),
      desiredIndustries: JSON.stringify(extracted.desiredIndustries || []),
      experienceLevel: JSON.stringify(
        Array.isArray(extracted.experienceLevel)
          ? extracted.experienceLevel
          : [extracted.experienceLevel || "mid"]
      ),
      locationPreference: JSON.stringify(
        Array.isArray(extracted.locationPreference)
          ? extracted.locationPreference
          : [extracted.locationPreference || "remote"]
      ),
      preferredLocations: JSON.stringify(extracted.preferredLocations || []),
      salaryMin: extracted.salaryMin || null,
      salaryMax: extracted.salaryMax || null,
      employmentType: JSON.stringify(extracted.employmentType || ["full_time"]),
      desiredSkills: JSON.stringify(extracted.desiredSkills || []),
      excludeKeywords: JSON.stringify(extracted.excludeKeywords || []),
      companySizePreference: JSON.stringify(
        Array.isArray(extracted.companySizePreference)
          ? extracted.companySizePreference
          : extracted.companySizePreference === "any"
          ? ["startup", "mid", "enterprise"]
          : [extracted.companySizePreference || "startup", "mid", "enterprise"]
      ),
      additionalNotes: null,
      updatedAt: new Date().toISOString(),
    };

    const existing = db.select().from(schema.jobPreferences).limit(1).get();
    if (existing) {
      db.update(schema.jobPreferences).set(values).run();
    } else {
      db.insert(schema.jobPreferences).values(values).run();
    }

    return NextResponse.json({
      preferences: {
        ...extracted,
        // Ensure arrays
        desiredRoles: extracted.desiredRoles || [],
        desiredIndustries: extracted.desiredIndustries || [],
        preferredLocations: extracted.preferredLocations || [],
        employmentType: extracted.employmentType || ["full_time"],
        desiredSkills: extracted.desiredSkills || [],
        excludeKeywords: extracted.excludeKeywords || [],
      },
      searchQueries: extracted.searchQueries || [],
    });
  } catch (error) {
    console.error("Auto-generate preferences error:", error);
    const message = error instanceof Error ? error.message : "Failed to auto-generate preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
