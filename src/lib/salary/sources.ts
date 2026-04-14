import {
  getFirecrawlClient,
  scrapeUrl,
  isFirecrawlConfigured,
} from "@/lib/firecrawl/client";
import type { SalaryBenchmark } from "./scraper";

interface SearchResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

async function firecrawlSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const client = await getFirecrawlClient();
  if (!client) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client as any).search(query, { limit });
    return (res?.data || res?.web || []) as SearchResult[];
  } catch (e) {
    console.error("Firecrawl salary search error:", e);
    return [];
  }
}

// --- Currency detection ---
const CURRENCY_MAP: [RegExp, string, string, number][] = [
  [/india|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|gurugram|gurgaon|noida/i, "INR", "₹", 1],
  [/united kingdom|london|uk\b|england|scotland/i, "GBP", "£", 1],
  [/europe|germany|france|berlin|paris|amsterdam|netherlands|spain|italy|eu\b/i, "EUR", "€", 1],
  [/japan|tokyo/i, "JPY", "¥", 1],
  [/canada|toronto|vancouver|montreal/i, "CAD", "$", 1],
  [/australia|sydney|melbourne/i, "AUD", "$", 1],
  [/singapore/i, "SGD", "$", 1],
  [/united states|usa|us\b|san francisco|new york|seattle|california|texas/i, "USD", "$", 1],
];

function detectCurrency(location: string | null | undefined): string {
  if (!location) return "INR";
  for (const [pattern, code] of CURRENCY_MAP) {
    if (pattern.test(location)) return code;
  }
  return "INR";
}

// --- Parse Indian salary formats ---
// Matches: "₹16L", "16 LPA", "₹16,00,000", "16 lakhs", "1.2 Cr", "Rs 25 lakh"
function parseIndianSalary(text: string): number | null {
  // "16L" / "16 LPA" / "16 Lakhs" / "₹16L"
  const lakhMatch = text.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:L|lakh|lakhs|lac|lacs|LPA)\b/i);
  if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000;

  // "1.2 Cr" / "1.2 Crore"
  const croreMatch = text.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:Cr|crore|crores)\b/i);
  if (croreMatch) return parseFloat(croreMatch[1]) * 10000000;

  // "₹16,00,000" Indian number format
  const indianNumMatch = text.match(/₹\s*(\d{1,2},?\d{2},?\d{3})/);
  if (indianNumMatch) return parseInt(indianNumMatch[1].replace(/,/g, ""));

  // "Rs 25,00,000"
  const rsMatch = text.match(/rs\.?\s*(\d[\d,]+)/i);
  if (rsMatch) {
    const val = parseInt(rsMatch[1].replace(/,/g, ""));
    if (val > 10000) return val;
  }

  return null;
}

// --- Parse western salary formats ---
// Matches: "$150,000", "$150K", "€80,000"
function parseWesternSalary(text: string): number | null {
  // "$150K" / "$150k"
  const kMatch = text.match(/[\$£€]\s*(\d+(?:\.\d+)?)\s*[kK]\b/);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;

  // "$150,000"
  const fullMatch = text.match(/[\$£€]\s*(\d{1,3}(?:,\d{3})+)/);
  if (fullMatch) return parseInt(fullMatch[1].replace(/,/g, ""));

  // "$150000"
  const plainMatch = text.match(/[\$£€]\s*(\d{5,})/);
  if (plainMatch) return parseInt(plainMatch[1]);

  return null;
}

function parseSalaryValue(text: string, currency: string): number | null {
  if (currency === "INR") {
    return parseIndianSalary(text) || parseWesternSalary(text);
  }
  return parseWesternSalary(text) || parseIndianSalary(text);
}

// --- Parse salary range from text ---
interface ParsedSalaryRange {
  min: number | null;
  max: number | null;
  median: number | null;
}

function parseSalaryRange(text: string, currency: string): ParsedSalaryRange {
  // "₹16L - ₹25L" or "$120K - $180K" or "16-25 LPA"
  const rangePatterns = [
    // "₹16L - ₹25L" or "16L - 25L"
    /(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:L|lakh|lakhs|lac)\s*(?:-|to|–)\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:L|lakh|lakhs|lac|LPA)/i,
    // "$120K - $180K"
    /[\$£€]\s*(\d+(?:\.\d+)?)\s*[kK]\s*(?:-|to|–)\s*[\$£€]?\s*(\d+(?:\.\d+)?)\s*[kK]/,
    // "$120,000 - $180,000"
    /[\$£€]\s*(\d{1,3}(?:,\d{3})+)\s*(?:-|to|–)\s*[\$£€]?\s*(\d{1,3}(?:,\d{3})+)/,
    // "16-25 LPA"
    /(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(?:LPA|lakh|lakhs)/i,
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (match) {
      let min: number | null = null;
      let max: number | null = null;

      if (/lakh|lac|lpa|L\b/i.test(match[0])) {
        min = parseFloat(match[1]) * 100000;
        max = parseFloat(match[2]) * 100000;
      } else if (/[kK]/.test(match[0])) {
        min = parseFloat(match[1]) * 1000;
        max = parseFloat(match[2]) * 1000;
      } else {
        min = parseInt(match[1].replace(/,/g, ""));
        max = parseInt(match[2].replace(/,/g, ""));
      }

      return { min, max, median: min && max ? Math.round((min + max) / 2) : null };
    }
  }

  // Single value — treat as median
  const single = parseSalaryValue(text, currency);
  if (single) {
    return { min: null, max: null, median: single };
  }

  return { min: null, max: null, median: null };
}

// ============================================================
// SOURCE 1: AmbitionBox (Indian market leader)
// ============================================================
async function scrapeAmbitionBox(
  jobTitle: string,
  company?: string | null,
  location?: string | null,
): Promise<SalaryBenchmark[]> {
  const benchmarks: SalaryBenchmark[] = [];
  const currency = detectCurrency(location);

  const queries = [
    `${jobTitle} salary AmbitionBox ${company || ""} ${location || "India"}`.trim(),
    `site:ambitionbox.com ${jobTitle} salary ${company || ""}`.trim(),
  ];

  for (const query of queries) {
    const results = await firecrawlSearch(query, 3);
    for (const r of results) {
      if (!r.url?.includes("ambitionbox")) continue;
      const text = `${r.title || ""} ${r.description || ""} ${r.markdown || ""}`;
      const range = parseSalaryRange(text, currency);

      if (range.min || range.max || range.median) {
        // Try to extract sample size
        const sampleMatch = text.match(/based on (\d[\d,]*) salaries/i) || text.match(/(\d[\d,]*)\s+salaries/i);
        const sampleSize = sampleMatch ? parseInt(sampleMatch[1].replace(/,/g, "")) : null;

        // Try to extract experience range
        const expMatch = text.match(/(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?)/i);

        benchmarks.push({
          jobTitle,
          company: company || null,
          location: location || "India",
          salaryMin: range.min,
          salaryMax: range.max,
          salaryMedian: range.median,
          salaryP25: null,
          salaryP75: null,
          salaryP90: null,
          baseSalaryMin: null,
          baseSalaryMax: null,
          bonusMin: null,
          bonusMax: null,
          stocksMin: null,
          stocksMax: null,
          currency,
          source: "ambitionbox",
          sourceUrl: r.url || null,
          sampleSize,
          confidence: sampleSize && sampleSize > 50 ? "high" : sampleSize && sampleSize > 10 ? "medium" : "low",
          experienceMin: expMatch ? parseInt(expMatch[1]) : null,
          experienceMax: expMatch ? parseInt(expMatch[2]) : null,
        });
        break; // One good result per query is enough
      }
    }
  }

  return benchmarks;
}

// ============================================================
// SOURCE 2: Glassdoor
// ============================================================
async function scrapeGlassdoor(
  jobTitle: string,
  company?: string | null,
  location?: string | null,
): Promise<SalaryBenchmark[]> {
  const benchmarks: SalaryBenchmark[] = [];
  const currency = detectCurrency(location);

  const query = `${jobTitle} salary Glassdoor ${company || ""} ${location || ""}`.trim();
  const results = await firecrawlSearch(query, 3);

  for (const r of results) {
    if (!r.url?.includes("glassdoor")) continue;
    const text = `${r.title || ""} ${r.description || ""} ${r.markdown || ""}`;
    const range = parseSalaryRange(text, currency);

    if (range.min || range.max || range.median) {
      const sampleMatch = text.match(/(\d[\d,]*)\s+salaries/i);
      benchmarks.push({
        jobTitle,
        company: company || null,
        location: location || null,
        salaryMin: range.min,
        salaryMax: range.max,
        salaryMedian: range.median,
        salaryP25: null,
        salaryP75: null,
        salaryP90: null,
        baseSalaryMin: null,
        baseSalaryMax: null,
        bonusMin: null,
        bonusMax: null,
        stocksMin: null,
        stocksMax: null,
        currency,
        source: "glassdoor",
        sourceUrl: r.url || null,
        sampleSize: sampleMatch ? parseInt(sampleMatch[1].replace(/,/g, "")) : null,
        confidence: "medium",
        experienceMin: null,
        experienceMax: null,
      });
      break;
    }
  }

  return benchmarks;
}

// ============================================================
// SOURCE 3: Levels.fyi (best for tech compensation)
// ============================================================
async function scrapeLevelsFyi(
  jobTitle: string,
  company?: string | null,
  location?: string | null,
): Promise<SalaryBenchmark[]> {
  const benchmarks: SalaryBenchmark[] = [];
  const currency = detectCurrency(location);

  const query = `${jobTitle} total compensation levels.fyi ${company || ""} ${location || ""}`.trim();
  const results = await firecrawlSearch(query, 3);

  for (const r of results) {
    if (!r.url?.includes("levels.fyi") && !r.url?.includes("levelsfyi")) continue;
    const text = `${r.title || ""} ${r.description || ""} ${r.markdown || ""}`;
    const range = parseSalaryRange(text, currency);

    if (range.min || range.max || range.median) {
      // Levels.fyi often has base + stock + bonus breakdown
      let baseSalaryMin: number | null = null;
      let baseSalaryMax: number | null = null;
      let stocksMin: number | null = null;
      let stocksMax: number | null = null;
      let bonusMin: number | null = null;
      let bonusMax: number | null = null;

      const baseMatch = text.match(/base[^:]*[:]\s*([\$₹€£]?\s*[\d,.]+\s*[kKLl]?)/i);
      if (baseMatch) {
        const baseVal = parseSalaryValue(baseMatch[1], currency);
        if (baseVal) { baseSalaryMin = baseVal; baseSalaryMax = baseVal; }
      }

      const stockMatch = text.match(/stock[^:]*[:]\s*([\$₹€£]?\s*[\d,.]+\s*[kKLl]?)/i);
      if (stockMatch) {
        const stockVal = parseSalaryValue(stockMatch[1], currency);
        if (stockVal) { stocksMin = stockVal; stocksMax = stockVal; }
      }

      const bonusMatch = text.match(/bonus[^:]*[:]\s*([\$₹€£]?\s*[\d,.]+\s*[kKLl]?)/i);
      if (bonusMatch) {
        const bonusVal = parseSalaryValue(bonusMatch[1], currency);
        if (bonusVal) { bonusMin = bonusVal; bonusMax = bonusVal; }
      }

      benchmarks.push({
        jobTitle,
        company: company || null,
        location: location || null,
        salaryMin: range.min,
        salaryMax: range.max,
        salaryMedian: range.median,
        salaryP25: null,
        salaryP75: null,
        salaryP90: null,
        baseSalaryMin,
        baseSalaryMax,
        bonusMin,
        bonusMax,
        stocksMin,
        stocksMax,
        currency,
        source: "levels_fyi",
        sourceUrl: r.url || null,
        sampleSize: null,
        confidence: "high",
        experienceMin: null,
        experienceMax: null,
      });
      break;
    }
  }

  return benchmarks;
}

// ============================================================
// SOURCE 4: Payscale
// ============================================================
async function scrapePayscale(
  jobTitle: string,
  location?: string | null,
): Promise<SalaryBenchmark[]> {
  const benchmarks: SalaryBenchmark[] = [];
  const currency = detectCurrency(location);

  const query = `${jobTitle} salary Payscale ${location || ""}`.trim();
  const results = await firecrawlSearch(query, 3);

  for (const r of results) {
    if (!r.url?.includes("payscale")) continue;
    const text = `${r.title || ""} ${r.description || ""} ${r.markdown || ""}`;
    const range = parseSalaryRange(text, currency);

    if (range.min || range.max || range.median) {
      // Payscale often has percentiles
      let p25: number | null = null;
      let p75: number | null = null;
      let p90: number | null = null;

      const p25Match = text.match(/(?:25th|10th)\s*percentile[^:]*[:]\s*([\$₹€£]?\s*[\d,.]+\s*[kKLl]?)/i);
      if (p25Match) p25 = parseSalaryValue(p25Match[1], currency);
      const p75Match = text.match(/(?:75th|90th)\s*percentile[^:]*[:]\s*([\$₹€£]?\s*[\d,.]+\s*[kKLl]?)/i);
      if (p75Match) p75 = parseSalaryValue(p75Match[1], currency);

      benchmarks.push({
        jobTitle,
        company: null,
        location: location || null,
        salaryMin: range.min,
        salaryMax: range.max,
        salaryMedian: range.median,
        salaryP25: p25,
        salaryP75: p75,
        salaryP90: p90,
        baseSalaryMin: null,
        baseSalaryMax: null,
        bonusMin: null,
        bonusMax: null,
        stocksMin: null,
        stocksMax: null,
        currency,
        source: "payscale",
        sourceUrl: r.url || null,
        sampleSize: null,
        confidence: "medium",
        experienceMin: null,
        experienceMax: null,
      });
      break;
    }
  }

  return benchmarks;
}

// ============================================================
// SOURCE 5: General web search (catches LinkedIn Salary, Indeed, Naukri, etc.)
// ============================================================
async function scrapeGeneralWeb(
  jobTitle: string,
  company?: string | null,
  location?: string | null,
): Promise<SalaryBenchmark[]> {
  const benchmarks: SalaryBenchmark[] = [];
  const currency = detectCurrency(location);

  const query = `${jobTitle} ${company || ""} average salary CTC range ${location || ""} 2024 2025`.trim();
  const results = await firecrawlSearch(query, 5);

  for (const r of results) {
    // Skip sources we already handle
    if (r.url?.includes("ambitionbox") || r.url?.includes("glassdoor") ||
        r.url?.includes("levels.fyi") || r.url?.includes("payscale")) continue;

    const text = `${r.title || ""} ${r.description || ""} ${r.markdown || ""}`;
    const range = parseSalaryRange(text, currency);

    if (range.min || range.max || range.median) {
      let sourceName = "web_search";
      try {
        if (r.url) {
          const host = new URL(r.url).hostname.replace("www.", "").split(".")[0];
          sourceName = host;
        }
      } catch { /* skip */ }

      benchmarks.push({
        jobTitle,
        company: company || null,
        location: location || null,
        salaryMin: range.min,
        salaryMax: range.max,
        salaryMedian: range.median,
        salaryP25: null,
        salaryP75: null,
        salaryP90: null,
        baseSalaryMin: null,
        baseSalaryMax: null,
        bonusMin: null,
        bonusMax: null,
        stocksMin: null,
        stocksMax: null,
        currency,
        source: sourceName,
        sourceUrl: r.url || null,
        sampleSize: null,
        confidence: "low",
        experienceMin: null,
        experienceMax: null,
      });
    }
  }

  return benchmarks;
}

// ============================================================
// SOURCE 6: Deep scrape — actually visit salary pages for detailed data
// ============================================================
async function deepScrapeSalaryPage(
  url: string,
  jobTitle: string,
  source: string,
  location?: string | null,
  company?: string | null,
): Promise<SalaryBenchmark | null> {
  const result = await scrapeUrl(url);
  if (!result.success || !result.markdown) return null;

  const text = result.markdown;
  const currency = detectCurrency(location);

  // Extract all salary-like values from the page
  const salaryValues: number[] = [];
  const salaryRegexes = [
    /(?:₹|rs\.?\s*)(\d+(?:\.\d+)?)\s*(?:L|lakh|lakhs|lac)\b/gi,
    /[\$£€]\s*(\d+(?:\.\d+)?)\s*[kK]\b/g,
    /[\$£€]\s*(\d{1,3}(?:,\d{3})+)/g,
  ];

  for (const regex of salaryRegexes) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      let val: number;
      if (/lakh|lac|L\b/i.test(match[0])) {
        val = parseFloat(match[1]) * 100000;
      } else if (/[kK]/.test(match[0])) {
        val = parseFloat(match[1]) * 1000;
      } else {
        val = parseInt(match[1].replace(/,/g, ""));
      }
      if (val > 0 && val < 100000000) salaryValues.push(val); // sanity check: < 10Cr / $10M
    }
  }

  if (salaryValues.length === 0) return null;

  salaryValues.sort((a, b) => a - b);
  const len = salaryValues.length;

  // Extract percentiles and ranges
  const p25 = salaryValues[Math.floor(len * 0.25)] || null;
  const p75 = salaryValues[Math.floor(len * 0.75)] || null;
  const p90 = salaryValues[Math.floor(len * 0.9)] || null;

  // Try to extract sample size
  const sampleMatch = text.match(/based on (\d[\d,]*) salaries/i) ||
    text.match(/(\d[\d,]*)\s+salaries\s+(?:received|submitted|reported)/i);

  // Try to extract experience range
  const expMatch = text.match(/(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?experience/i);

  return {
    jobTitle,
    company: company || null,
    location: location || null,
    salaryMin: salaryValues[0] || null,
    salaryMax: salaryValues[len - 1] || null,
    salaryMedian: salaryValues[Math.floor(len / 2)] || null,
    salaryP25: p25,
    salaryP75: p75,
    salaryP90: p90,
    baseSalaryMin: null,
    baseSalaryMax: null,
    bonusMin: null,
    bonusMax: null,
    stocksMin: null,
    stocksMax: null,
    currency,
    source: source + "_deep",
    sourceUrl: url,
    sampleSize: sampleMatch ? parseInt(sampleMatch[1].replace(/,/g, "")) : salaryValues.length,
    confidence: salaryValues.length >= 5 ? "high" : salaryValues.length >= 3 ? "medium" : "low",
    experienceMin: expMatch ? parseInt(expMatch[1]) : null,
    experienceMax: expMatch ? parseInt(expMatch[2]) : null,
  };
}

// ============================================================
// MAIN: Run all sources in parallel
// ============================================================
export async function firecrawlSalarySearch(
  jobTitle: string,
  location?: string | null,
  company?: string | null,
  experience?: number | null,
): Promise<SalaryBenchmark[]> {
  if (!(await isFirecrawlConfigured())) {
    return [];
  }

  // Run all source scrapers in parallel
  const [ambitionbox, glassdoor, levelsFyi, payscale, general] = await Promise.allSettled([
    scrapeAmbitionBox(jobTitle, company, location),
    scrapeGlassdoor(jobTitle, company, location),
    scrapeLevelsFyi(jobTitle, company, location),
    scrapePayscale(jobTitle, location),
    scrapeGeneralWeb(jobTitle, company, location),
  ]);

  const allBenchmarks: SalaryBenchmark[] = [];

  // Collect results from all settled promises
  for (const result of [ambitionbox, glassdoor, levelsFyi, payscale, general]) {
    if (result.status === "fulfilled") {
      allBenchmarks.push(...result.value);
    }
  }

  // Deep scrape: pick the best URLs from search results for detailed data
  const deepScrapeUrls: { url: string; source: string }[] = [];
  for (const b of allBenchmarks) {
    if (b.sourceUrl && (b.source === "ambitionbox" || b.source === "glassdoor" || b.source === "levels_fyi")) {
      deepScrapeUrls.push({ url: b.sourceUrl, source: b.source });
    }
  }

  // Deep scrape up to 3 pages in parallel
  if (deepScrapeUrls.length > 0) {
    const deepResults = await Promise.allSettled(
      deepScrapeUrls.slice(0, 3).map((u) =>
        deepScrapeSalaryPage(u.url, jobTitle, u.source, location, company)
      )
    );
    for (const result of deepResults) {
      if (result.status === "fulfilled" && result.value) {
        allBenchmarks.push(result.value);
      }
    }
  }

  return allBenchmarks;
}
