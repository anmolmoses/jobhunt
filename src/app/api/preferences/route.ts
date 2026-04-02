import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";

function safeParseJson(str: string, fallback: unknown = []) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const prefs = db
      .select()
      .from(schema.jobPreferences)
      .orderBy(desc(schema.jobPreferences.updatedAt))
      .limit(1)
      .get();

    if (!prefs) {
      return NextResponse.json(null);
    }

    // Handle both legacy strings and new array formats
    const toArray = (val: string, fallback: string[]) => {
      const parsed = safeParseJson(val, null);
      return Array.isArray(parsed) ? parsed : [val];
    };

    return NextResponse.json({
      ...prefs,
      desiredRoles: safeParseJson(prefs.desiredRoles),
      desiredIndustries: safeParseJson(prefs.desiredIndustries),
      experienceLevel: toArray(prefs.experienceLevel, ["mid"]),
      locationPreference: toArray(prefs.locationPreference, ["remote"]),
      preferredLocations: safeParseJson(prefs.preferredLocations),
      employmentType: safeParseJson(prefs.employmentType),
      desiredSkills: safeParseJson(prefs.desiredSkills),
      excludeKeywords: safeParseJson(prefs.excludeKeywords),
      companySizePreference: toArray(prefs.companySizePreference, ["startup", "mid", "enterprise"]),
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    return NextResponse.json({ error: "Failed to get preferences" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Normalize all multi-select fields to JSON arrays
    const toJsonArray = (val: unknown, fallback: string[]) =>
      JSON.stringify(Array.isArray(val) ? val : val ? [val] : fallback);

    const values = {
      desiredRoles: JSON.stringify(body.desiredRoles || []),
      desiredIndustries: JSON.stringify(body.desiredIndustries || []),
      experienceLevel: toJsonArray(body.experienceLevel, ["mid"]),
      locationPreference: toJsonArray(body.locationPreference, ["remote"]),
      preferredLocations: JSON.stringify(body.preferredLocations || []),
      salaryMin: body.salaryMin || null,
      salaryMax: body.salaryMax || null,
      employmentType: JSON.stringify(body.employmentType || ["full_time"]),
      desiredSkills: JSON.stringify(body.desiredSkills || []),
      excludeKeywords: JSON.stringify(body.excludeKeywords || []),
      companySizePreference: toJsonArray(body.companySizePreference, ["startup", "mid", "enterprise"]),
      additionalNotes: body.additionalNotes || null,
      updatedAt: new Date().toISOString(),
    };

    const existing = db.select().from(schema.jobPreferences).limit(1).get();

    let result;
    if (existing) {
      db.update(schema.jobPreferences).set(values).run();
      result = { ...existing, ...values };
    } else {
      result = db.insert(schema.jobPreferences).values(values).returning().get();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Update preferences error:", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
