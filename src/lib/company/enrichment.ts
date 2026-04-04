import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/settings";
import { createAIProvider } from "@/lib/ai/provider";
import { COMPANY_ENRICHMENT_SYSTEM_PROMPT, COMPANY_ENRICHMENT_USER_PROMPT } from "@/lib/ai/prompts";
import {
  isFirecrawlConfigured,
  searchCompanyIntelligence,
  type CompanyIntelligence,
} from "@/lib/firecrawl/client";

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

interface SalaryData {
  median: number | null;
  min: number | null;
  max: number | null;
  currency: string;
  publisherName: string | null;
  jobTitle: string | null;
  location: string | null;
}

const LOCATION_CURRENCY_MAP: [RegExp, string, string][] = [
  [/india|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|gurugram|gurgaon|noida/i, "INR", "₹"],
  [/united kingdom|london|uk|england|scotland|wales/i, "GBP", "£"],
  [/europe|germany|france|berlin|paris|amsterdam|netherlands|spain|italy|eu\b/i, "EUR", "€"],
  [/japan|tokyo/i, "JPY", "¥"],
  [/canada|toronto|vancouver|montreal/i, "CAD", "CA$"],
  [/australia|sydney|melbourne/i, "AUD", "A$"],
  [/singapore/i, "SGD", "S$"],
];

function detectCurrency(location: string | null): { code: string; symbol: string } {
  if (!location) return { code: "USD", symbol: "$" };
  for (const [pattern, code, symbol] of LOCATION_CURRENCY_MAP) {
    if (pattern.test(location)) return { code, symbol };
  }
  return { code: "USD", symbol: "$" };
}

interface CompanyInfo {
  companySize: string | null;
  companySizeCategory: string | null;
  companyType: string | null;
  industry: string | null;
  description: string | null;
  headquarters: string | null;
  aiInsights: string | null;
  // New fields from Firecrawl web search
  founded: string | null;
  funding: string | null;
  fundingStage: string | null;
  valuation: string | null;
  investors: string | null;
  revenue: string | null;
  growthSignals: string | null;
  glassdoorRating: string | null;
  dataSources: string[];
}

export interface CompanyEnrichmentData {
  companyName: string;
  salary: SalaryData;
  company: CompanyInfo;
  cached: boolean;
}

export async function enrichCompany(
  companyName: string,
  jobTitle: string,
  location: string | null,
  jobDescription: string | null
): Promise<CompanyEnrichmentData> {
  const normalized = normalizeCompanyName(companyName);

  // Check cache first
  const cached = db
    .select()
    .from(schema.companyEnrichment)
    .where(eq(schema.companyEnrichment.normalizedName, normalized))
    .get();

  if (cached) {
    return {
      companyName: cached.companyName,
      salary: {
        median: cached.salaryMedian,
        min: cached.salaryMin,
        max: cached.salaryMax,
        currency: detectCurrency(cached.salaryLocation).code,
        publisherName: cached.salaryPublisherName,
        jobTitle: cached.salaryJobTitle,
        location: cached.salaryLocation,
      },
      company: {
        companySize: cached.companySize,
        companySizeCategory: cached.companySizeCategory,
        companyType: cached.companyType,
        industry: cached.industry,
        description: cached.description,
        headquarters: cached.headquarters,
        aiInsights: cached.aiInsights,
        founded: cached.founded ?? null,
        funding: cached.funding ?? null,
        fundingStage: cached.fundingStage ?? null,
        valuation: cached.valuation ?? null,
        investors: cached.investors ?? null,
        revenue: cached.revenue ?? null,
        growthSignals: cached.growthSignals ?? null,
        glassdoorRating: cached.glassdoorRating ?? null,
        dataSources: safeParse(cached.dataSources, []),
      },
      cached: true,
    };
  }

  // --- Firecrawl-first: search the web for real company data ---
  let companyInfo: CompanyInfo;
  let salaryData: SalaryData;

  if (await isFirecrawlConfigured()) {
    // STEP 1: Search the web for real company data (no AI)
    let intel: CompanyIntelligence | null = null;
    try {
      intel = await searchCompanyIntelligence(companyName, jobTitle, location);
    } catch (e) {
      console.error("Firecrawl company intelligence failed:", e);
    }

    // STEP 2: Fetch salary from JSearch API in parallel
    salaryData = await fetchSalaryData(jobTitle, location);

    if (intel && (intel.description || intel.funding || intel.companySize)) {
      // Got real web data — use it directly
      companyInfo = {
        companySize: intel.companySize,
        companySizeCategory: intel.companySizeCategory,
        companyType: intel.companyType,
        industry: intel.industry,
        description: intel.description,
        headquarters: intel.headquarters,
        aiInsights: intel.insights,
        founded: intel.founded,
        funding: intel.funding,
        fundingStage: intel.fundingStage,
        valuation: intel.valuation,
        investors: intel.investors,
        revenue: intel.revenue,
        growthSignals: intel.growthSignals,
        glassdoorRating: intel.glassdoorRating,
        dataSources: intel.dataSources,
      };

      // If Firecrawl also found salary data and JSearch didn't, use it
      if (!salaryData.median && intel.salaryRange) {
        companyInfo.aiInsights = (companyInfo.aiInsights || "") +
          (companyInfo.aiInsights ? " " : "") +
          `Salary range from web: ${intel.salaryRange}.`;
      }
    } else {
      // Firecrawl search returned nothing — fall back to AI
      const aiResult = await analyzeCompany(companyName, jobTitle, location, jobDescription);
      companyInfo = {
        ...aiResult,
        founded: null, funding: null, fundingStage: null, valuation: null,
        investors: null, revenue: null, growthSignals: null,
        glassdoorRating: null, dataSources: ["AI"],
      };
    }
  } else {
    // No Firecrawl: pure AI path
    [salaryData, companyInfo] = await Promise.all([
      fetchSalaryData(jobTitle, location),
      analyzeCompany(companyName, jobTitle, location, jobDescription).then((ai) => ({
        ...ai,
        founded: null, funding: null, fundingStage: null, valuation: null,
        investors: null, revenue: null, growthSignals: null,
        glassdoorRating: null, dataSources: ["AI"] as string[],
      })),
    ]);
  }

  // Cache the results
  db.insert(schema.companyEnrichment)
    .values({
      companyName,
      normalizedName: normalized,
      salaryMedian: salaryData.median,
      salaryMin: salaryData.min,
      salaryMax: salaryData.max,
      salaryPublisherName: salaryData.publisherName,
      salaryJobTitle: salaryData.jobTitle,
      salaryLocation: salaryData.location,
      companySize: companyInfo.companySize,
      companySizeCategory: companyInfo.companySizeCategory,
      companyType: companyInfo.companyType,
      industry: companyInfo.industry,
      description: companyInfo.description,
      headquarters: companyInfo.headquarters,
      aiInsights: companyInfo.aiInsights,
      founded: companyInfo.founded,
      funding: companyInfo.funding,
      fundingStage: companyInfo.fundingStage,
      valuation: companyInfo.valuation,
      investors: companyInfo.investors,
      revenue: companyInfo.revenue,
      growthSignals: companyInfo.growthSignals,
      glassdoorRating: companyInfo.glassdoorRating,
      dataSources: JSON.stringify(companyInfo.dataSources),
      rawSalaryData: JSON.stringify(salaryData),
      rawAiResponse: JSON.stringify(companyInfo),
    })
    .run();

  return {
    companyName,
    salary: salaryData,
    company: companyInfo,
    cached: false,
  };
}

function safeParse(s: string | null | undefined, fallback: unknown = []): string[] {
  if (!s) return fallback as string[];
  try { return JSON.parse(s); } catch { return fallback as string[]; }
}

async function fetchSalaryData(jobTitle: string, location: string | null): Promise<SalaryData> {
  const nullResult: SalaryData = { median: null, min: null, max: null, currency: "USD", publisherName: null, jobTitle: null, location: null };
  try {
    const apiKey = await getSetting("jsearch_api_key");
    if (!apiKey) return nullResult;

    const params = new URLSearchParams({
      job_title: jobTitle,
      location: location || "United States",
      radius: "100",
    });

    const res = await fetch(
      `https://jsearch.p.rapidapi.com/estimated-salary?${params.toString()}`,
      {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      }
    );

    if (!res.ok) {
      console.error("JSearch salary API error:", res.status);
      return nullResult;
    }

    const data = await res.json();
    const salaries = data.data || [];

    if (salaries.length === 0) return nullResult;

    let totalMin = 0;
    let totalMax = 0;
    let totalMedian = 0;
    let count = 0;
    let publisherName = null;

    for (const entry of salaries) {
      if (entry.min_salary != null && entry.max_salary != null) {
        totalMin += entry.min_salary;
        totalMax += entry.max_salary;
        totalMedian += entry.median_salary || (entry.min_salary + entry.max_salary) / 2;
        count++;
        if (!publisherName) publisherName = entry.publisher_name;
      }
    }

    if (count === 0) return nullResult;

    const { code } = detectCurrency(salaries[0]?.location || location);

    return {
      median: Math.round(totalMedian / count),
      min: Math.round(totalMin / count),
      currency: code,
      max: Math.round(totalMax / count),
      publisherName,
      jobTitle,
      location: salaries[0]?.location || location,
    };
  } catch (error) {
    console.error("Salary fetch error:", error);
    return nullResult;
  }
}

/** AI fallback — only used when Firecrawl is not configured or returns no data */
async function analyzeCompany(
  companyName: string,
  jobTitle: string,
  location: string | null,
  jobDescription: string | null,
): Promise<Omit<CompanyInfo, "founded" | "funding" | "fundingStage" | "valuation" | "investors" | "revenue" | "growthSignals" | "glassdoorRating" | "dataSources">> {
  try {
    const aiProvider = await createAIProvider();

    const descriptionContent = jobDescription ? jobDescription.slice(0, 3000) : "No description available";
    const userContent = COMPANY_ENRICHMENT_USER_PROMPT(companyName, jobTitle, location || "Unknown", descriptionContent);

    const rawResponse = await aiProvider.complete({
      messages: [
        { role: "system", content: COMPANY_ENRICHMENT_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      maxTokens: 512,
      temperature: 0.2,
      responseFormat: "json",
    });

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonStr);

    return {
      companySize: result.companySize || null,
      companySizeCategory: result.companySizeCategory || null,
      companyType: result.companyType || null,
      industry: result.industry || null,
      description: result.description || null,
      headquarters: result.headquarters || null,
      aiInsights: result.aiInsights || null,
    };
  } catch (error) {
    console.error("Company analysis error:", error);
    return {
      companySize: null,
      companySizeCategory: null,
      companyType: null,
      industry: null,
      description: null,
      headquarters: null,
      aiInsights: null,
    };
  }
}
