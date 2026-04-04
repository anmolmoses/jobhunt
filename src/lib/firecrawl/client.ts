import FirecrawlApp from "@mendable/firecrawl-js";
import { getSetting } from "@/lib/settings";

let cachedClient: FirecrawlApp | null = null;
let cachedUrl: string | null = null;

export interface ExtractedCompanyData {
  description: string | null;
  industry: string | null;
  headquarters: string | null;
  companySize: string | null;
  companySizeCategory: string | null;
  companyType: string | null;
  aiInsights: string | null;
  confidence: "high" | "medium" | "low";
}

interface SearchResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function firecrawlSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const client = await getFirecrawlClient();
  if (!client) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client as any).search(query, { limit });
    // SDK v4 returns { web: [...] }, raw API returns { data: [...] }
    return (res?.data || res?.web || []) as SearchResult[];
  } catch (e) {
    console.error("Firecrawl search error:", e);
    return [];
  }
}

export interface CompanyIntelligence {
  description: string | null;
  industry: string | null;
  headquarters: string | null;
  companySize: string | null;
  companySizeCategory: "startup" | "mid" | "enterprise" | null;
  companyType: "public" | "private" | "startup" | "nonprofit" | "government" | null;
  founded: string | null;
  funding: string | null;
  fundingStage: string | null;
  valuation: string | null;
  investors: string | null;
  revenue: string | null;
  growthSignals: string | null;
  salaryRange: string | null;
  glassdoorRating: string | null;
  insights: string | null;
  dataSources: string[];
}

/**
 * Search the web for real company data using Firecrawl search.
 * Runs 3 parallel searches: overview/funding, salary, general info.
 * Parses structured data from search result titles and descriptions.
 * No AI involved — all data comes from real web sources.
 */
export async function searchCompanyIntelligence(
  companyName: string,
  jobTitle?: string,
  location?: string | null,
): Promise<CompanyIntelligence | null> {
  const client = await getFirecrawlClient();
  if (!client) return null;

  // Run 3 targeted searches in parallel
  const [fundingResults, salaryResults, overviewResults] = await Promise.all([
    firecrawlSearch(`${companyName} crunchbase funding`, 5),
    firecrawlSearch(`${companyName} ${jobTitle || "software engineer"} salary glassdoor ambitionbox${location ? " " + location : ""}`, 3),
    firecrawlSearch(`${companyName} company about employees headquarters`, 5),
  ]);

  const allResults = [...fundingResults, ...salaryResults, ...overviewResults];
  if (allResults.length === 0) return null;

  const allText = allResults.map((r) => `${r.title || ""} ${r.description || ""}`).join("\n");
  const dataSources: string[] = [];

  // --- Parse funding data ---
  let funding: string | null = null;
  let fundingStage: string | null = null;
  let valuation: string | null = null;
  let investors: string | null = null;

  // Total funding: "$742M" or "$1.2B" etc
  const fundingMatch = allText.match(/(?:total\s+funding|raised)\s+(?:of\s+)?\$?([\d,.]+\s*[BMK](?:illion|n)?)/i);
  if (fundingMatch) {
    funding = "$" + fundingMatch[1].trim();
    for (const r of fundingResults) if (r.url && !dataSources.includes("Crunchbase") && /crunchbase/i.test(r.url)) dataSources.push("Crunchbase");
    if (!dataSources.length) for (const r of fundingResults) if (r.url && /tracxn/i.test(r.url)) dataSources.push("Tracxn");
  }

  // Funding stage: "Series F", "Seed", "IPO"
  const stageMatch = allText.match(/(?:latest|last|recent)\s+(?:funding\s+)?round\s+(?:was\s+)?(?:a\s+)?(Series\s+[A-Z]|Seed|Pre-Seed|Angel|IPO|Pre-IPO)/i)
    || allText.match(/(Series\s+[A-Z])\s+(?:round|funding)/i)
    || allText.match(/\b(IPO|Pre-IPO|Seed|Pre-Seed|Series\s+[A-Z])\b/i);
  if (stageMatch) fundingStage = stageMatch[1].trim();

  // Valuation
  const valMatch = allText.match(/valuation\s+(?:of\s+)?\$?([\d,.]+\s*[BMK](?:illion|n)?)/i)
    || allText.match(/valued\s+at\s+\$?([\d,.]+\s*[BMK](?:illion|n)?)/i);
  if (valMatch) valuation = "$" + valMatch[1].trim();

  // Investors
  const investorMatch = allText.match(/(?:investors?\s+include|backed by|funded by)\s+([^.]+)/i);
  if (investorMatch) investors = investorMatch[1].replace(/\s+and\s+\d+\s+others?\.?$/i, "").trim().slice(0, 150);

  // --- Parse salary data ---
  let salaryRange: string | null = null;
  let glassdoorRating: string | null = null;

  // Salary: "₹16,00,000" or "$150,000" patterns
  const salaryMatch = allText.match(/(?:average|median)\s+(?:salary|salaries)[^.]*?([\$₹€£][\d,]+(?:\s*(?:LPA|per\s+year|\/yr|annually))?)/i)
    || allText.match(/salary[^.]*?([\$₹€£]\s*[\d,]+(?:\s*-\s*[\$₹€£]?\s*[\d,]+)?(?:\s*(?:LPA|per\s+year|\/yr))?)/i);
  if (salaryMatch) {
    salaryRange = salaryMatch[1].trim();
    for (const r of salaryResults) if (r.url && /glassdoor/i.test(r.url) && !dataSources.includes("Glassdoor")) dataSources.push("Glassdoor");
    if (!dataSources.some((s) => s === "Glassdoor")) for (const r of salaryResults) if (r.url && /ambitionbox/i.test(r.url)) dataSources.push("AmbitionBox");
  }

  // Glassdoor rating
  const ratingMatch = allText.match(/(\d\.\d)\s*(?:\/5|out of 5|star|rating)/i);
  if (ratingMatch) glassdoorRating = ratingMatch[1] + "/5";

  // --- Parse company overview ---
  let description: string | null = null;
  let industry: string | null = null;
  let headquarters: string | null = null;
  let companySize: string | null = null;
  let companySizeCategory: "startup" | "mid" | "enterprise" | null = null;
  let companyType: "public" | "private" | "startup" | "nonprofit" | "government" | null = null;
  let founded: string | null = null;
  let revenue: string | null = null;
  let growthSignals: string | null = null;

  // Description — first meaningful search result description
  for (const r of [...overviewResults, ...fundingResults]) {
    const desc = r.description || "";
    if (desc.length > 40 && !desc.toLowerCase().includes("explore") && !desc.toLowerCase().includes("information on")) {
      description = desc.slice(0, 300);
      break;
    }
  }

  // Employee count
  const empMatch = allText.match(/(\d[\d,]+)\+?\s*(?:employees|people|team members|staff)/i)
    || allText.match(/(?:employs?|team of|workforce of)\s+(\d[\d,]+)/i);
  if (empMatch) {
    const count = parseInt(empMatch[1].replace(/,/g, ""));
    companySize = count > 5000 ? "5000+" : count > 1000 ? "1001-5000" : count > 500 ? "501-1000"
      : count > 200 ? "201-500" : count > 50 ? "51-200" : count > 10 ? "11-50" : "1-10";
    companySizeCategory = count > 1000 ? "enterprise" : count > 200 ? "mid" : "startup";
  }

  // Company type
  if (/\bpublic(?:ly traded)?\b|\bNYSE\b|\bNASDAQ\b|\bBSE\b|\bNSE\b/i.test(allText)) companyType = "public";
  else if (/\bprivate(?:ly held)?\b/i.test(allText)) companyType = "private";
  else if (fundingStage && /seed|series\s+[a-c]/i.test(fundingStage)) companyType = "startup";
  else if (fundingStage) companyType = "private";

  // Headquarters
  const hqMatch = allText.match(/(?:headquartered?|based|hq)\s+in\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,\s*(?:and|with|the|is|was)|$)/i);
  if (hqMatch) headquarters = hqMatch[1].trim().slice(0, 80);

  // Founded
  const foundedMatch = allText.match(/(?:founded|established|started)\s+(?:in\s+)?(\d{4})/i);
  if (foundedMatch) founded = foundedMatch[1];

  // Industry
  const industryPatterns = [
    /(?:industry|sector)[:\s]+([A-Z][a-zA-Z\s&]+?)(?:\.|,|$)/i,
    /\bis\s+(?:a|an)\s+([a-z][a-z\s]+?)\s+(?:company|platform|startup|firm|provider)/i,
  ];
  for (const p of industryPatterns) {
    const m = allText.match(p);
    if (m && m[1].length < 50) { industry = m[1].trim(); break; }
  }

  // Revenue
  const revMatch = allText.match(/(?:revenue|ARR)\s+(?:of\s+)?\$?([\d,.]+\s*[BMK](?:illion|n)?)/i);
  if (revMatch) revenue = "$" + revMatch[1].trim();

  // Growth signals
  const growthParts: string[] = [];
  if (/(?:growing|growth)\s+(?:rapidly|fast|quickly|significantly)/i.test(allText)) growthParts.push("Rapid growth");
  if (/(?:hiring|recruiting)\s+(?:actively|aggressively|heavily)/i.test(allText)) growthParts.push("Actively hiring");
  if (/(?:expand|expansion|expanding)\s+(?:into|to|globally)/i.test(allText)) growthParts.push("Expanding");
  if (/(?:profitable|profitability)/i.test(allText)) growthParts.push("Profitable");
  if (/(?:unicorn|decacorn)/i.test(allText)) growthParts.push("Unicorn");
  if (/\bIPO\b/i.test(allText)) growthParts.push("IPO track");
  growthSignals = growthParts.length > 0 ? growthParts.join(", ") : null;

  // Build insights summary from real data
  const insightParts: string[] = [];
  if (funding) insightParts.push(`Raised ${funding}${fundingStage ? ` (${fundingStage})` : ""}`);
  if (valuation) insightParts.push(`Valued at ${valuation}`);
  if (revenue) insightParts.push(`Revenue: ${revenue}`);
  if (founded) insightParts.push(`Founded ${founded}`);
  if (growthSignals) insightParts.push(growthSignals);
  if (glassdoorRating) insightParts.push(`Glassdoor: ${glassdoorRating}`);
  const insights = insightParts.length > 0 ? insightParts.join(". ") + "." : null;

  if (dataSources.length === 0) {
    for (const r of allResults) {
      if (r.url) {
        try {
          const host = new URL(r.url).hostname.replace("www.", "").split(".")[0];
          if (!dataSources.includes(host)) dataSources.push(host);
        } catch { /* skip */ }
      }
      if (dataSources.length >= 3) break;
    }
  }

  return {
    description, industry, headquarters, companySize, companySizeCategory,
    companyType, founded, funding, fundingStage, valuation, investors,
    revenue, growthSignals, salaryRange, glassdoorRating, insights, dataSources,
  };
}

/**
 * Get a configured Firecrawl client. Returns null if not configured.
 * Supports self-hosted instances (user provides their Docker URL).
 */
export async function getFirecrawlClient(): Promise<FirecrawlApp | null> {
  const apiUrl = await getSetting("firecrawl_api_url");
  if (!apiUrl) return null;

  // Return cached client if URL hasn't changed
  if (cachedClient && cachedUrl === apiUrl) return cachedClient;

  const apiKey = await getSetting("firecrawl_api_key");

  cachedClient = new FirecrawlApp({
    apiUrl,
    apiKey: apiKey || undefined,
  });
  cachedUrl = apiUrl;

  return cachedClient;
}

/**
 * Check if Firecrawl is configured and reachable.
 */
export async function isFirecrawlConfigured(): Promise<boolean> {
  const apiUrl = await getSetting("firecrawl_api_url");
  return !!apiUrl;
}

export interface ScrapeResult {
  markdown: string | null;
  metadata: {
    title?: string;
    description?: string;
    ogImage?: string;
    [key: string]: unknown;
  };
  success: boolean;
}

/**
 * Scrape a single URL and return clean markdown content.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const client = await getFirecrawlClient();
  if (!client) {
    return { markdown: null, metadata: {}, success: false };
  }

  try {
    const result = await client.scrape(url, {
      formats: ["markdown"],
    });

    return {
      markdown: result.markdown || null,
      metadata: (result.metadata as Record<string, unknown>) || {},
      success: true,
    };
  } catch (error) {
    console.error("Firecrawl scrape error:", error);
    return { markdown: null, metadata: {}, success: false };
  }
}

/**
 * Scrape a company website for enrichment data (about page, careers, contact).
 * Returns combined markdown from relevant pages.
 */
export async function scrapeCompanyInfo(companyDomain: string): Promise<{
  aboutContent: string | null;
  contactContent: string | null;
  careersContent: string | null;
}> {
  const client = await getFirecrawlClient();
  if (!client) {
    return { aboutContent: null, contactContent: null, careersContent: null };
  }

  const baseUrl = companyDomain.startsWith("http") ? companyDomain : `https://${companyDomain}`;

  // Try common pages in parallel
  const pages = [
    { key: "aboutContent", paths: ["/about", "/about-us", "/company"] },
    { key: "contactContent", paths: ["/contact", "/contact-us", "/locations", "/offices"] },
    { key: "careersContent", paths: ["/careers", "/jobs"] },
  ];

  const results: Record<string, string | null> = {
    aboutContent: null,
    contactContent: null,
    careersContent: null,
  };

  for (const page of pages) {
    for (const path of page.paths) {
      try {
        const result = await client.scrape(`${baseUrl}${path}`, {
          formats: ["markdown"],
        });
        if (result.markdown && result.markdown.length > 100) {
          results[page.key] = result.markdown.slice(0, 5000);
          break; // Found content for this category, move to next
        }
      } catch {
        // Page doesn't exist or failed, try next path
      }
    }
  }

  return results as { aboutContent: string | null; contactContent: string | null; careersContent: string | null };
}

/**
 * Clean raw scraped markdown from a job page.
 * Strips navigation, images, tracking links, UI buttons, and other page chrome
 * to extract just the meaningful job description content.
 */
function cleanJobMarkdown(raw: string): string {
  let text = raw;

  // Remove markdown images: ![alt](url) and [![alt](img)](link)
  text = text.replace(/\[?!\[[^\]]*\]\([^)]*\)\]?(?:\([^)]*\))?/g, "");

  // Remove "Skip to" navigation links
  text = text.replace(/\[Skip to [^\]]*\]\([^)]*\)/gi, "");

  // Remove links that are just UI actions
  text = text.replace(/\[(Apply|Save|Report this job|Sign in|Show more|Show less|Close menu|See who[^\]]*)\]\([^)]*\)/gi, "");

  // Remove empty links: [](url)
  text = text.replace(/\[\s*\]\([^)]*\)/g, "");

  // Turn remaining markdown links into just their display text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Remove bare UI action lines and list items containing them
  text = text.replace(/^\s*(?:\*\s*)?(?:Apply|Save|Report this job|Show more|Show less|Close menu|See who .*)\s*$/gim, "");
  // "Show more Show less" on same line
  text = text.replace(/^\s*Show more\s+Show less\s*$/gim, "");

  // Remove lines that are just URLs
  text = text.replace(/^\s*https?:\/\/\S+\s*$/gm, "");

  // Remove horizontal rules
  text = text.replace(/^---+\s*$/gm, "");

  // Remove empty headings (#### followed by nothing meaningful)
  text = text.replace(/^#{1,6}\s*$/gm, "");

  // Remove setext-style underline headings (===== or -----) and the line above if it duplicates an existing heading
  text = text.replace(/^(.+)\n={3,}\s*$/gm, (_, title) => `## ${title.trim()}`);
  text = text.replace(/^(.+)\n-{3,}\s*$/gm, (_, title) => `### ${title.trim()}`);

  // Remove "X ago Y applicants" metadata lines (LinkedIn-specific)
  text = text.replace(/^\s*\d+\s+(?:day|hour|week|month)s?\s+ago\s+\d+\s+applicants?\s*$/gim, "");

  // Clean up LinkedIn footer metadata sections into simple bold labels
  text = text.replace(/^\s*\*\s*#{1,4}\s*(Seniority level|Employment type|Job function|Industries)\s*$/gim, (_match, label) => {
    return `**${label.trim()}:**`;
  });

  // Remove duplicate headings (same text, possibly different levels)
  const lines = text.split("\n");
  const filtered: string[] = [];
  const seenHeadings = new Set<string>();
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase();
      if (seenHeadings.has(headingText)) continue; // skip duplicate
      seenHeadings.add(headingText);
    }
    filtered.push(line);
  }
  text = filtered.join("\n");

  // Remove list items that are empty or just whitespace
  text = text.replace(/^\s*[*-]\s*\n/gm, "");

  // Collapse 3+ blank lines into 2
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Scrape a full job description from the apply URL.
 * Useful when provider-supplied descriptions are truncated.
 */
export async function scrapeJobDescription(applyUrl: string): Promise<string | null> {
  const result = await scrapeUrl(applyUrl);
  if (!result.success || !result.markdown) return null;

  const cleaned = cleanJobMarkdown(result.markdown);
  return cleaned.slice(0, 8000) || null;
}

// --- Patterns for parsing company data from scraped content ---

const SIZE_PATTERNS: [RegExp, string, string][] = [
  [/\b(\d{1,3},?\d{3})\+?\s*employees\b/i, "$1+", "enterprise"],
  [/\bover\s+(\d{1,3},?\d{3})\s*(employees|people|team members)\b/i, "$1+", "enterprise"],
  [/\b(5,?000|10,?000|50,?000|100,?000)\+?\s*(employees|people)\b/i, "$1+", "enterprise"],
  [/\b(1,?00[1-9]|[2-9],?\d{3}|[1-4],?\d{3})\s*(employees|people|team members)\b/i, "1001-5000", "enterprise"],
  [/\b(50[1-9]|[6-9]\d{2}|1,?000)\s*(employees|people|team members)\b/i, "501-1000", "mid"],
  [/\b(20[1-9]|[3-4]\d{2}|500)\s*(employees|people|team members)\b/i, "201-500", "mid"],
  [/\b(5[1-9]|[6-9]\d|1\d{2}|200)\s*(employees|people|team members)\b/i, "51-200", "startup"],
  [/\b(1[1-9]|[2-4]\d|50)\s*(employees|people|team members)\b/i, "11-50", "startup"],
  [/\bteam of\s+(\d+)/i, "1-50", "startup"],
  [/\bseries\s+[a-b]\b/i, "11-50", "startup"],
  [/\bseries\s+[c-e]\b/i, "51-200", "startup"],
  [/\bfortune\s+500\b/i, "5000+", "enterprise"],
  [/\bglobal\s+(?:leader|company|enterprise)\b/i, "5000+", "enterprise"],
];

const TYPE_PATTERNS: [RegExp, string][] = [
  [/\bpublic(?:ly traded| company)\b|\bnyse\b|\bnasdaq\b|\bticker\b/i, "public"],
  [/\bprivate(?:ly held| company)\b/i, "private"],
  [/\bstartup\b|\bearly[- ]stage\b|\bseed\b|\bseries\s+[a-e]\b/i, "startup"],
  [/\bnon[- ]?profit\b|\bngo\b|\bcharity\b/i, "nonprofit"],
  [/\bgovernment\b|\bfederal\b|\bpublic sector\b/i, "government"],
];

const HQ_PATTERNS: [RegExp, number][] = [
  [/\bheadquartered?\s+in\s+([A-Z][a-zA-Z\s,]+)/i, 1],
  [/\bbased\s+in\s+([A-Z][a-zA-Z\s,]+)/i, 1],
  [/\bhq\s*:\s*([A-Z][a-zA-Z\s,]+)/i, 1],
  [/\bmain\s+office\s+in\s+([A-Z][a-zA-Z\s,]+)/i, 1],
];

function parseCompanyDataFromContent(
  markdown: string,
  metadata: Record<string, unknown>
): Partial<ExtractedCompanyData> {
  const result: Partial<ExtractedCompanyData> = {};
  const text = markdown + "\n" + (metadata.description || "") + "\n" + (metadata.ogDescription || "");

  // Description from metadata (most reliable)
  const metaDesc = (metadata.description || metadata.ogDescription || "") as string;
  if (metaDesc && metaDesc.length > 20) {
    result.description = metaDesc.slice(0, 300);
  }

  // Company size
  for (const [pattern, size, category] of SIZE_PATTERNS) {
    if (pattern.test(text)) {
      result.companySize = size;
      result.companySizeCategory = category;
      break;
    }
  }

  // Company type
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(text)) {
      result.companyType = type;
      break;
    }
  }

  // Headquarters
  for (const [pattern, group] of HQ_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[group]) {
      // Clean up: take first meaningful portion, trim trailing noise
      let hq = match[group].trim().replace(/[.,;]$/, "").slice(0, 80);
      // Stop at common noise words
      hq = hq.split(/\b(?:with|and|since|where|that|is|was|our)\b/i)[0].trim();
      if (hq.length > 3) {
        result.headquarters = hq;
        break;
      }
    }
  }

  return result;
}

/**
 * Extract structured company data using Firecrawl scraping + content parsing.
 * This is the Firecrawl-first approach: scrape real company pages and parse
 * structured data from the content and metadata. No AI needed.
 *
 * Returns extracted data with a confidence level. If confidence is "low",
 * the caller should fall back to AI analysis.
 */
export async function extractCompanyData(companyDomain: string): Promise<ExtractedCompanyData | null> {
  const client = await getFirecrawlClient();
  if (!client) return null;

  const baseUrl = companyDomain.startsWith("http") ? companyDomain : `https://${companyDomain}`;

  // Scrape homepage + about page in parallel for maximum data
  const pagesToScrape = [
    baseUrl,
    `${baseUrl}/about`,
    `${baseUrl}/about-us`,
    `${baseUrl}/company`,
  ];

  let bestMarkdown = "";
  let bestMetadata: Record<string, unknown> = {};
  let aboutMarkdown = "";

  const results = await Promise.allSettled(
    pagesToScrape.map((url) =>
      client.scrape(url, { formats: ["markdown"] }).catch(() => null)
    )
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const { markdown, metadata } = r.value as { markdown?: string; metadata?: Record<string, unknown> };
    if (!markdown || markdown.length < 100) continue;

    if (i === 0) {
      // Homepage — best metadata source
      bestMetadata = (metadata as Record<string, unknown>) || {};
      bestMarkdown = markdown;
    } else if (!aboutMarkdown) {
      // First successful about page
      aboutMarkdown = markdown;
    }
  }

  if (!bestMarkdown && !aboutMarkdown) return null;

  const combinedMarkdown = (bestMarkdown + "\n\n" + aboutMarkdown).slice(0, 10000);
  const parsed = parseCompanyDataFromContent(combinedMarkdown, bestMetadata);

  // Determine confidence based on how much data we extracted
  const fields = [parsed.description, parsed.companySize, parsed.companyType, parsed.headquarters];
  const filledCount = fields.filter(Boolean).length;
  const confidence: "high" | "medium" | "low" =
    filledCount >= 3 ? "high" : filledCount >= 1 ? "medium" : "low";

  // Derive industry from metadata/content if possible
  let industry: string | null = null;
  const keywords = (bestMetadata.keywords || "") as string;
  if (keywords) {
    // First keyword is often the industry
    const first = keywords.split(",")[0]?.trim();
    if (first && first.length < 40) industry = first;
  }

  return {
    description: parsed.description || null,
    industry: industry || null,
    headquarters: parsed.headquarters || null,
    companySize: parsed.companySize || null,
    companySizeCategory: parsed.companySizeCategory || null,
    companyType: parsed.companyType || null,
    aiInsights: aboutMarkdown
      ? `Scraped from company website. ${parsed.description || ""}`.trim()
      : null,
    confidence,
  };
}

/**
 * Returns raw scraped company content for use as AI context (fallback path).
 * Separate from extractCompanyData so the enrichment flow can use scraped
 * markdown as context for AI when structured extraction has gaps.
 */
export async function scrapeCompanyContext(companyDomain: string): Promise<string> {
  const scraped = await scrapeCompanyInfo(companyDomain);
  const parts: string[] = [];
  if (scraped.aboutContent) parts.push(`ABOUT PAGE:\n${scraped.aboutContent.slice(0, 2000)}`);
  if (scraped.contactContent) parts.push(`CONTACT/OFFICES PAGE:\n${scraped.contactContent.slice(0, 2000)}`);
  if (scraped.careersContent) parts.push(`CAREERS PAGE:\n${scraped.careersContent.slice(0, 1000)}`);
  return parts.join("\n\n");
}

/**
 * Batch scrape multiple URLs in parallel using Firecrawl's /v1/batch/scrape.
 * Much faster than sequential scraping for enriching multiple job descriptions.
 * Returns a map of URL → markdown content.
 */
export async function batchScrapeUrls(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const client = await getFirecrawlClient();
  if (!client || urls.length === 0) return results;

  try {
    if (urls.length === 1) {
      // Single URL — use regular scrape
      const result = await scrapeUrl(urls[0]);
      if (result.success && result.markdown) {
        results.set(urls[0], result.markdown.slice(0, 8000));
      }
      return results;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchResult = await (client as any).batchScrapeUrls(urls, { formats: ["markdown"] });

    // batchScrapeUrls returns an async job — poll for results
    if (batchResult?.data) {
      for (const item of batchResult.data) {
        if (item.markdown && item.metadata?.sourceURL) {
          results.set(item.metadata.sourceURL, item.markdown.slice(0, 8000));
        }
      }
    }
  } catch (e) {
    console.error("Batch scrape error:", e);
    // Fall back to sequential scraping
    for (const url of urls.slice(0, 10)) {
      try {
        const result = await scrapeUrl(url);
        if (result.success && result.markdown) {
          results.set(url, result.markdown.slice(0, 8000));
        }
      } catch { /* skip failed URLs */ }
    }
  }

  return results;
}
