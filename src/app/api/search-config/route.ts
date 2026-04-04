import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

function getConfigValue(key: string): string | null {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  return row?.value ?? null;
}

function setConfigValue(key: string, value: string) {
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  if (existing) {
    db.update(schema.settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key, value, isEncrypted: false })
      .run();
  }
}

function safeParse(s: string | null, fallback: unknown) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

export async function GET() {
  try {
    // Load search config from settings
    const customQueries = safeParse(getConfigValue("search_custom_queries"), []);
    const enabledProviders = safeParse(getConfigValue("search_enabled_providers"), null);
    const datePosted = getConfigValue("search_date_posted") || "7d";
    const resultsPerPage = parseInt(getConfigValue("search_results_per_page") || "25", 10);
    const maxQueries = parseInt(getConfigValue("search_max_queries") || "3", 10);
    const useCustomQueriesOnly = getConfigValue("search_use_custom_queries_only") === "true";

    // Load current preferences to show what data is being used
    const prefs = db
      .select()
      .from(schema.jobPreferences)
      .orderBy(desc(schema.jobPreferences.updatedAt))
      .limit(1)
      .get();

    const parsedPrefs = prefs ? {
      desiredRoles: safeParse(prefs.desiredRoles, []),
      desiredSkills: safeParse(prefs.desiredSkills, []),
      experienceLevel: safeParse(prefs.experienceLevel, ["mid"]),
      locationPreference: safeParse(prefs.locationPreference, ["remote"]),
      preferredLocations: safeParse(prefs.preferredLocations, []),
      employmentType: safeParse(prefs.employmentType, ["full_time"]),
      excludeKeywords: safeParse(prefs.excludeKeywords, []),
      salaryMin: prefs.salaryMin,
      salaryMax: prefs.salaryMax,
    } : null;

    // Load latest resume info
    const resume = db
      .select({ id: schema.resumes.id, fileName: schema.resumes.fileName })
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    // Detect which providers are available (have API keys configured)
    const allProviders = [
      { id: "linkedin", name: "LinkedIn", requiresKey: false },
      { id: "indeed", name: "Indeed", requiresKey: false },
      { id: "jsearch", name: "JSearch", requiresKey: true, keyName: "jsearch_api_key" },
      { id: "adzuna", name: "Adzuna", requiresKey: true, keyName: "adzuna_app_id" },
      { id: "remotive", name: "Remotive", requiresKey: false },
      { id: "remoteok", name: "RemoteOK", requiresKey: false },
      { id: "jobicy", name: "Jobicy", requiresKey: false },
      { id: "hackernews", name: "Hacker News", requiresKey: false },
      { id: "firecrawl", name: "Firecrawl Web Search", requiresKey: true, keyName: "firecrawl_api_url" },
    ];

    const configuredProviders = [];
    for (const p of allProviders) {
      let configured = true;
      if (p.requiresKey && p.keyName) {
        const key = getConfigValue(p.keyName);
        const envMap: Record<string, string> = {
          jsearch_api_key: "JSEARCH_API_KEY",
          adzuna_app_id: "ADZUNA_APP_ID",
          firecrawl_api_url: "FIRECRAWL_API_URL",
        };
        if (!key && !process.env[envMap[p.keyName] || ""]) {
          configured = false;
        }
      }
      const enabled = enabledProviders
        ? (enabledProviders as string[]).includes(p.id)
        : configured; // Default: all configured providers enabled
      configuredProviders.push({
        ...p,
        configured,
        enabled,
      });
    }

    return NextResponse.json({
      customQueries,
      enabledProviders: configuredProviders,
      datePosted,
      resultsPerPage,
      maxQueries,
      useCustomQueriesOnly,
      preferences: parsedPrefs,
      hasResume: !!resume,
      resumeFileName: resume?.fileName || null,
    });
  } catch (error) {
    console.error("Get search config error:", error);
    return NextResponse.json({ error: "Failed to load search config" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.customQueries !== undefined) {
      setConfigValue("search_custom_queries", JSON.stringify(body.customQueries));
    }
    if (body.enabledProviders !== undefined) {
      setConfigValue("search_enabled_providers", JSON.stringify(body.enabledProviders));
    }
    if (body.datePosted !== undefined) {
      setConfigValue("search_date_posted", body.datePosted);
    }
    if (body.resultsPerPage !== undefined) {
      setConfigValue("search_results_per_page", String(body.resultsPerPage));
    }
    if (body.maxQueries !== undefined) {
      setConfigValue("search_max_queries", String(body.maxQueries));
    }
    if (body.useCustomQueriesOnly !== undefined) {
      setConfigValue("search_use_custom_queries_only", String(body.useCustomQueriesOnly));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Save search config error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
