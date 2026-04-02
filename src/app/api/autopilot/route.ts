import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { analyzeResume } from "@/lib/resume/analyzer";
import { createAIProvider } from "@/lib/ai/provider";
import { searchJobs } from "@/lib/jobs/orchestrator";
import {
  AUTO_EXTRACT_PREFERENCES_SYSTEM_PROMPT,
  AUTO_EXTRACT_PREFERENCES_USER_PROMPT,
} from "@/lib/ai/prompts";

interface AutopilotStep {
  step: string;
  status: "completed" | "skipped" | "failed";
  message: string;
}

export async function POST() {
  const steps: AutopilotStep[] = [];

  try {
    // Step 1: Check for resume
    const resume = db
      .select()
      .from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    if (!resume?.parsedText) {
      return NextResponse.json({
        error: "Please upload a resume first",
        steps: [{ step: "resume", status: "failed", message: "No resume found. Upload one first." }],
      }, { status: 400 });
    }

    steps.push({ step: "resume", status: "completed", message: `Using resume: ${resume.fileName}` });

    // Step 2: Analyze resume if not already analyzed
    let analysis = db
      .select()
      .from(schema.resumeAnalyses)
      .orderBy(desc(schema.resumeAnalyses.createdAt))
      .limit(1)
      .get();

    if (!analysis) {
      try {
        const result = await analyzeResume(resume.parsedText);
        analysis = db
          .insert(schema.resumeAnalyses)
          .values({
            resumeId: resume.id,
            aiProvider: result.provider,
            overallScore: result.analysis.overallScore,
            formattingScore: result.analysis.formattingScore,
            contentScore: result.analysis.contentScore,
            keywordScore: result.analysis.keywordScore,
            atsScore: result.analysis.atsScore,
            summary: result.analysis.summary,
            strengths: JSON.stringify(result.analysis.strengths),
            improvements: JSON.stringify(result.analysis.improvements),
            toRemove: JSON.stringify(result.analysis.toRemove),
            toAdd: JSON.stringify(result.analysis.toAdd),
            detailedFeedback: result.analysis.detailedFeedback,
            rawResponse: result.rawResponse,
          })
          .returning()
          .get();
        steps.push({ step: "analyze", status: "completed", message: `Resume scored ${result.analysis.overallScore}/100` });
      } catch (e) {
        steps.push({ step: "analyze", status: "failed", message: `Analysis failed: ${e instanceof Error ? e.message : "unknown"}` });
        // Continue without analysis
      }
    } else {
      steps.push({ step: "analyze", status: "skipped", message: `Already analyzed (score: ${analysis.overallScore}/100)` });
    }

    // Step 3: Auto-extract preferences
    let searchQueries: string[] = [];
    try {
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
      searchQueries = extracted.searchQueries || [];

      // Save preferences
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

      steps.push({
        step: "preferences",
        status: "completed",
        message: `Extracted ${(extracted.desiredRoles || []).length} roles, ${(extracted.desiredSkills || []).length} skills`,
      });
    } catch (e) {
      steps.push({ step: "preferences", status: "failed", message: `Preference extraction failed: ${e instanceof Error ? e.message : "unknown"}` });
    }

    // Step 4: Search for jobs using AI-generated queries
    if (searchQueries.length === 0) {
      // Fallback: use desired roles from preferences
      const prefs = db.select().from(schema.jobPreferences).limit(1).get();
      if (prefs) {
        const roles = JSON.parse(prefs.desiredRoles);
        searchQueries = roles.length > 0 ? [roles.join(", ")] : ["software developer"];
      } else {
        searchQueries = ["software developer"];
      }
    }

    // Get location from preferences
    const prefsForSearch = db.select().from(schema.jobPreferences).limit(1).get();
    let searchLocation: string | undefined;
    let searchRemote = false;

    if (prefsForSearch) {
      const locations = JSON.parse(prefsForSearch.preferredLocations || "[]");
      if (locations.length > 0) {
        searchLocation = locations[0]; // Use first preferred location
      }
      const locPref = (() => {
        try { return JSON.parse(prefsForSearch.locationPreference); }
        catch { return [prefsForSearch.locationPreference]; }
      })();
      searchRemote = Array.isArray(locPref) ? locPref.includes("remote") : locPref === "remote";
    }

    const allJobs: Array<Record<string, unknown>> = [];
    const allProviderResults: Array<{ provider: string; count: number; error?: string }> = [];

    for (const query of searchQueries.slice(0, 3)) {
      try {
        const result = await searchJobs({
          query,
          location: searchLocation,
          remote: searchRemote || undefined,
          experienceLevel: prefsForSearch?.experienceLevel as "senior" | "mid" | "entry" | "lead" | "executive" || undefined,
          datePosted: "7d",
          resultsPerPage: 25,
        });
        allJobs.push(...result.jobs.map((j) => ({ ...j })));
        for (const pr of result.providerResults) {
          const existing = allProviderResults.find((p) => p.provider === pr.provider);
          if (existing) {
            existing.count += pr.count;
          } else {
            allProviderResults.push({ ...pr });
          }
        }
      } catch {
        // Individual query failure doesn't stop others
      }
    }

    // Deduplicate across queries
    const seen = new Set<string>();
    const uniqueJobs = allJobs.filter((j) => {
      const key = `${(j as { title: string }).title}|${(j as { company: string }).company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const locMsg = searchLocation ? ` in ${searchLocation}` : "";
    const remoteMsg = searchRemote ? " (remote)" : "";
    steps.push({
      step: "search",
      status: uniqueJobs.length > 0 ? "completed" : "failed",
      message: `Found ${uniqueJobs.length} unique jobs from ${searchQueries.length} queries${locMsg}${remoteMsg}`,
    });

    return NextResponse.json({
      steps,
      searchQueries,
      jobs: uniqueJobs,
      providerResults: allProviderResults,
      totalJobs: uniqueJobs.length,
    });
  } catch (error) {
    console.error("Autopilot error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Autopilot failed",
      steps,
    }, { status: 500 });
  }
}
