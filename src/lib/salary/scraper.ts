import { db, schema } from "@/db";
import { eq, and, gte, like } from "drizzle-orm";
import { firecrawlSalarySearch } from "./sources";

/**
 * Normalize a job title for deduplication and matching.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(sr\.?|senior|jr\.?|junior|lead|principal|staff|intern|associate|manager|director|vp|head of)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export interface SalaryBenchmark {
  jobTitle: string;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryMedian: number | null;
  salaryP25: number | null;
  salaryP75: number | null;
  salaryP90: number | null;
  baseSalaryMin: number | null;
  baseSalaryMax: number | null;
  bonusMin: number | null;
  bonusMax: number | null;
  stocksMin: number | null;
  stocksMax: number | null;
  currency: string;
  source: string;
  sourceUrl: string | null;
  sampleSize: number | null;
  confidence: string;
  experienceMin: number | null;
  experienceMax: number | null;
}

/**
 * Get cached salary data for a job title, optionally filtered by company/location.
 * Returns null if no fresh data exists (cache expired or never scraped).
 */
export function getCachedSalaryData(
  jobTitle: string,
  company?: string | null,
  location?: string | null,
): SalaryBenchmark[] {
  const normalized = normalizeTitle(jobTitle);
  const now = new Date().toISOString();

  let query = db
    .select()
    .from(schema.salaryMarketData)
    .where(
      and(
        eq(schema.salaryMarketData.normalizedTitle, normalized),
        // Only return non-expired data
        gte(schema.salaryMarketData.expiresAt, now),
      )
    );

  const results = query.all();

  // Filter by company/location in JS (simpler than dynamic SQL)
  return results
    .filter((r) => {
      if (company && r.normalizedCompany && r.normalizedCompany !== normalizeCompany(company)) return false;
      if (location && r.location && !r.location.toLowerCase().includes(location.toLowerCase())) return false;
      return true;
    })
    .map((r) => ({
      jobTitle: r.jobTitle,
      company: r.company,
      location: r.location,
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryMedian: r.salaryMedian,
      salaryP25: r.salaryP25,
      salaryP75: r.salaryP75,
      salaryP90: r.salaryP90,
      baseSalaryMin: r.baseSalaryMin,
      baseSalaryMax: r.baseSalaryMax,
      bonusMin: r.bonusMin,
      bonusMax: r.bonusMax,
      stocksMin: r.stocksMin,
      stocksMax: r.stocksMax,
      currency: r.currency,
      source: r.source,
      sourceUrl: r.sourceUrl,
      sampleSize: r.sampleSize,
      confidence: r.confidence || "low",
      experienceMin: r.experienceMin,
      experienceMax: r.experienceMax,
    }));
}

/**
 * Store scraped salary data into the market data table.
 */
export function storeSalaryData(data: SalaryBenchmark[]): number {
  let inserted = 0;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7-day cache

  for (const d of data) {
    db.insert(schema.salaryMarketData)
      .values({
        jobTitle: d.jobTitle,
        normalizedTitle: normalizeTitle(d.jobTitle),
        company: d.company,
        normalizedCompany: d.company ? normalizeCompany(d.company) : null,
        location: d.location,
        experienceMin: d.experienceMin,
        experienceMax: d.experienceMax,
        salaryMin: d.salaryMin,
        salaryMax: d.salaryMax,
        salaryMedian: d.salaryMedian,
        salaryP25: d.salaryP25,
        salaryP75: d.salaryP75,
        salaryP90: d.salaryP90,
        currency: d.currency,
        baseSalaryMin: d.baseSalaryMin,
        baseSalaryMax: d.baseSalaryMax,
        bonusMin: d.bonusMin,
        bonusMax: d.bonusMax,
        stocksMin: d.stocksMin,
        stocksMax: d.stocksMax,
        source: d.source,
        sourceUrl: d.sourceUrl,
        sampleSize: d.sampleSize,
        confidence: d.confidence,
        rawData: JSON.stringify(d),
        expiresAt,
      })
      .run();
    inserted++;
  }

  return inserted;
}

/**
 * Main scraper: fetch salary data from all sources for a given role.
 * Uses Firecrawl to crawl Ambitionbox, Glassdoor, Levels.fyi, Payscale, and more.
 * Returns aggregated + per-source benchmarks.
 */
export async function scrapeSalaryIntelligence(
  jobTitle: string,
  location?: string | null,
  company?: string | null,
  experience?: number | null,
): Promise<{
  benchmarks: SalaryBenchmark[];
  aggregate: SalaryBenchmark | null;
  sources: string[];
  fromCache: boolean;
}> {
  // Check cache first
  const cached = getCachedSalaryData(jobTitle, company, location);
  if (cached.length > 0) {
    return {
      benchmarks: cached,
      aggregate: aggregateBenchmarks(cached, jobTitle, location),
      sources: [...new Set(cached.map((c) => c.source))],
      fromCache: true,
    };
  }

  // Scrape from all sources via Firecrawl
  const benchmarks = await firecrawlSalarySearch(jobTitle, location, company, experience);

  // Store in DB
  if (benchmarks.length > 0) {
    storeSalaryData(benchmarks);
  }

  return {
    benchmarks,
    aggregate: aggregateBenchmarks(benchmarks, jobTitle, location),
    sources: [...new Set(benchmarks.map((b) => b.source))],
    fromCache: false,
  };
}

/**
 * Aggregate multiple salary benchmarks into a single composite.
 */
function aggregateBenchmarks(
  benchmarks: SalaryBenchmark[],
  jobTitle: string,
  location?: string | null,
): SalaryBenchmark | null {
  if (benchmarks.length === 0) return null;

  const withMedian = benchmarks.filter((b) => b.salaryMedian != null);
  const withMin = benchmarks.filter((b) => b.salaryMin != null);
  const withMax = benchmarks.filter((b) => b.salaryMax != null);

  // Weighted average: sources with sample sizes weight more
  function weightedAvg(items: SalaryBenchmark[], field: keyof SalaryBenchmark): number | null {
    const valid = items.filter((i) => i[field] != null);
    if (valid.length === 0) return null;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const item of valid) {
      const weight = Math.max(item.sampleSize || 1, 1);
      weightedSum += (item[field] as number) * weight;
      totalWeight += weight;
    }
    return Math.round(weightedSum / totalWeight);
  }

  return {
    jobTitle,
    company: null,
    location: location || benchmarks[0]?.location || null,
    salaryMin: weightedAvg(withMin, "salaryMin"),
    salaryMax: weightedAvg(withMax, "salaryMax"),
    salaryMedian: weightedAvg(withMedian, "salaryMedian"),
    salaryP25: weightedAvg(benchmarks, "salaryP25"),
    salaryP75: weightedAvg(benchmarks, "salaryP75"),
    salaryP90: weightedAvg(benchmarks, "salaryP90"),
    baseSalaryMin: weightedAvg(benchmarks, "baseSalaryMin"),
    baseSalaryMax: weightedAvg(benchmarks, "baseSalaryMax"),
    bonusMin: weightedAvg(benchmarks, "bonusMin"),
    bonusMax: weightedAvg(benchmarks, "bonusMax"),
    stocksMin: weightedAvg(benchmarks, "stocksMin"),
    stocksMax: weightedAvg(benchmarks, "stocksMax"),
    currency: benchmarks[0]?.currency || "INR",
    source: "aggregate",
    sourceUrl: null,
    sampleSize: benchmarks.reduce((sum, b) => sum + (b.sampleSize || 0), 0),
    confidence: benchmarks.some((b) => b.confidence === "high") ? "high"
      : benchmarks.some((b) => b.confidence === "medium") ? "medium" : "low",
    experienceMin: null,
    experienceMax: null,
  };
}
