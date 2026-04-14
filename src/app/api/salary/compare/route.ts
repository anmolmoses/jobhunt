import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { scrapeSalaryIntelligence } from "@/lib/salary/scraper";

// POST — compare user's salary against market data and tracked companies
export async function POST(request: NextRequest) {
  try {
    const { jobTitle, location } = await request.json();

    // 1. Get user salary profile
    const profile = db
      .select()
      .from(schema.userSalaryProfile)
      .limit(1)
      .get();

    if (!profile) {
      return NextResponse.json({
        error: "Please set up your salary profile first",
        needsProfile: true,
      }, { status: 400 });
    }

    // 2. Get tracked companies from saved jobs
    const savedJobs = db
      .select()
      .from(schema.savedJobs)
      .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
      .orderBy(desc(schema.savedJobs.updatedAt))
      .all();

    // 3. Get enrichment data for tracked companies
    const companyEnrichments = db
      .select()
      .from(schema.companyEnrichment)
      .all();

    const enrichmentMap = new Map(
      companyEnrichments.map((e) => [e.normalizedName, e])
    );

    // 4. Build company salary comparison
    const title = jobTitle || profile.currentTitle || "Software Engineer";
    const loc = location || profile.location;

    // Get market data
    const marketData = await scrapeSalaryIntelligence(title, loc);

    // 5. Build per-company comparison
    const companyComparisons = [];
    const seenCompanies = new Set<string>();

    for (const row of savedJobs) {
      const company = row.job_results.company;
      const normalized = company.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenCompanies.has(normalized)) continue;
      seenCompanies.add(normalized);

      const enrichment = enrichmentMap.get(normalized);
      const jobSalaryMin = row.job_results.salaryMin;
      const jobSalaryMax = row.job_results.salaryMax;

      companyComparisons.push({
        company,
        status: row.saved_jobs.status,
        jobTitle: row.job_results.title,
        // From job listing
        listingSalaryMin: jobSalaryMin,
        listingSalaryMax: jobSalaryMax,
        listingSalary: row.job_results.salary,
        // From enrichment
        enrichedSalaryMin: enrichment?.salaryMin || null,
        enrichedSalaryMax: enrichment?.salaryMax || null,
        enrichedSalaryMedian: enrichment?.salaryMedian || null,
        // Expected salary (user-set)
        expectedSalary: row.saved_jobs.expectedSalary,
        expectedSalaryNotes: row.saved_jobs.expectedSalaryNotes,
        // Company info
        companyType: enrichment?.companyType || null,
        companySize: enrichment?.companySize || null,
        industry: enrichment?.industry || null,
        glassdoorRating: enrichment?.glassdoorRating || null,
        savedJobId: row.saved_jobs.id,
      });
    }

    // 6. Calculate positioning
    const userCtc = profile.currentCtc;
    const marketMedian = marketData.aggregate?.salaryMedian;
    const marketMin = marketData.aggregate?.salaryMin;
    const marketMax = marketData.aggregate?.salaryMax;
    const marketP75 = marketData.aggregate?.salaryP75;
    const marketP90 = marketData.aggregate?.salaryP90;

    let percentile: number | null = null;
    let positioning: string = "unknown";
    let hikeRecommendation: { min: number; max: number; recommended: number } | null = null;

    if (userCtc && marketMin && marketMax && marketMax > marketMin) {
      percentile = Math.round(((userCtc - marketMin) / (marketMax - marketMin)) * 100);
      percentile = Math.max(0, Math.min(100, percentile));

      if (percentile < 25) positioning = "below_market";
      else if (percentile < 50) positioning = "at_market_low";
      else if (percentile < 75) positioning = "at_market";
      else if (percentile < 90) positioning = "above_market";
      else positioning = "top_market";

      // Hike recommendation: aim for 75th-90th percentile
      const target75 = marketP75 || (marketMin + (marketMax - marketMin) * 0.75);
      const target90 = marketP90 || (marketMin + (marketMax - marketMin) * 0.9);
      const targetMid = (target75 + target90) / 2;

      hikeRecommendation = {
        min: Math.round(Math.max(target75, userCtc * 1.15)), // At least 15% hike
        max: Math.round(target90),
        recommended: Math.round(Math.max(targetMid, userCtc * 1.25)), // Target ~25% hike minimum
      };
    }

    return NextResponse.json({
      profile: {
        ...profile,
        salaryBreakdown: JSON.parse(profile.salaryBreakdown || "{}"),
        skills: JSON.parse(profile.skills || "[]"),
      },
      market: marketData,
      companies: companyComparisons,
      positioning: {
        percentile,
        positioning,
        userCtc,
        marketMin,
        marketMax,
        marketMedian,
        marketP75,
        marketP90,
        hikeRecommendation,
      },
    });
  } catch (error) {
    console.error("Salary compare error:", error);
    return NextResponse.json({ error: "Failed to compare salaries" }, { status: 500 });
  }
}
