import {
  getFirecrawlClient,
  isFirecrawlConfigured,
  scrapeUrl,
} from "@/lib/firecrawl/client";
import { createAIProvider } from "@/lib/ai/provider";
import type {
  JobSearchProvider,
  JobSearchParams,
  NormalizedJob,
} from "@/types/jobs";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ------------------------------------------------------------------ */
/*  URL classification                                                 */
/* ------------------------------------------------------------------ */

/** Domains/paths that host INDIVIDUAL job postings (scrape these directly) */
const DIRECT_POSTING_PATTERNS = [
  /careers\.\w+\.com\/.*job/i,
  /jobs\.\w+\.com\//i,
  /greenhouse\.io\/.*jobs\/\d/i,
  /lever\.co\/.*\/[a-f0-9-]{20,}/i,
  /myworkdayjobs\.com\//i,
  /ashbyhq\.com\//i,
  /linkedin\.com\/jobs\/view\/\d/i,
  /workable\.com\/j\//i,
  /icims\.com\//i,
  /smartrecruiters\.com\/.*\/\d/i,
  /careerlive\.in\/apply/i,
  /placementindia\.com\/job-detail/i,
];

/** Domains that are JOB AGGREGATORS — contain multiple job listings worth extracting */
const AGGREGATOR_DOMAINS = [
  "naukri.com",
  "indeed.com",
  "glassdoor.com",
  "glassdoor.co.in",
  "jooble.org",
  "simplyhired.com",
  "simplyhired.co.in",
  "recruit.net",
  "monster.com",
  "shine.com",
  "foundit.in",
  "linkedin.com/jobs/search",
];

/** Pages to skip entirely */
const SKIP_PATTERNS =
  /^\d[\d,]*\+?\s*(?:best\s+)?(?:jobs?|openings?|vacancies|positions?|results?)\s+(?:in|for|near|and)/i;
const SKIP_TITLES = /^(LinkedIn|Indeed|Glassdoor|Naukri|SimplyHired|Jooble)$/i;

function classifyUrl(url: string, title: string): "direct" | "aggregator" | "skip" {
  if (SKIP_TITLES.test(title)) return "skip";
  if (SKIP_PATTERNS.test(title)) return "skip";
  if (title.length < 10) return "skip";

  if (DIRECT_POSTING_PATTERNS.some((p) => p.test(url))) return "direct";
  if (AGGREGATOR_DOMAINS.some((d) => url.includes(d))) return "aggregator";

  // URLs with /job/ /career/ /apply/ in path are likely direct
  if (/\/(?:job|career|apply|position|opening)s?\/[^?#]+\w/i.test(url)) return "direct";

  return "direct"; // Default: treat as potential direct posting
}

/* ------------------------------------------------------------------ */
/*  Search hit interface                                               */
/* ------------------------------------------------------------------ */

interface SearchHit {
  title: string;
  url: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Main provider                                                      */
/* ------------------------------------------------------------------ */

/**
 * Firecrawl-powered deep-crawl job search provider.
 *
 * Pipeline:
 * 1. Search the web with multiple targeted queries
 * 2. Classify results: direct job postings vs aggregator listing pages
 * 3. Scrape direct posting pages for full content
 * 4. For aggregator pages: scrape + LLM extract individual job entries
 * 5. Follow extracted job links → scrape those too
 * 6. LLM extracts structured job data from all scraped content
 */
export class FirecrawlSearchProvider implements JobSearchProvider {
  readonly name = "firecrawl" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const client = await getFirecrawlClient();
    if (!client) throw new Error("Firecrawl not configured");

    // ── Stage 1: Multi-query search ──
    const queries = buildSearchQueries(params);
    const allHits = await searchMultiple(client, queries);

    if (allHits.length === 0) return [];

    // ── Stage 2: Classify & dedupe ──
    const seen = new Set<string>();
    const directHits: SearchHit[] = [];
    const aggregatorHits: SearchHit[] = [];

    for (const hit of allHits) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);

      const kind = classifyUrl(hit.url, hit.title);
      if (kind === "direct") directHits.push(hit);
      else if (kind === "aggregator") aggregatorHits.push(hit);
      // "skip" is dropped
    }

    // ── Stage 3: Scrape direct postings ──
    const directToScrape = directHits.slice(0, 8);
    const directScraped = await scrapeMultiple(directToScrape.map((h) => h.url));

    // ── Stage 4: Extract job links from aggregator pages via LLM ──
    let extraJobLinks: { title: string; company: string; url: string }[] = [];
    if (aggregatorHits.length > 0) {
      extraJobLinks = await extractJobLinksFromAggregators(
        aggregatorHits.slice(0, 3)
      );
    }

    // ── Stage 5: Scrape extracted job links ──
    const newLinks = extraJobLinks
      .filter((l) => l.url && !seen.has(l.url))
      .slice(0, 6);

    const extraScraped = await scrapeMultiple(newLinks.map((l) => l.url));

    // ── Stage 6: LLM extraction from all scraped content ──
    const allEntries: {
      title: string;
      url: string;
      description: string;
      markdown: string | null;
      preExtracted?: { company: string };
    }[] = [
      ...directToScrape.map((hit, i) => ({
        title: hit.title,
        url: hit.url,
        description: hit.description,
        markdown: directScraped.get(hit.url) || null,
      })),
      ...newLinks.map((link, i) => ({
        title: link.title,
        url: link.url,
        description: "",
        markdown: extraScraped.get(link.url) || null,
        preExtracted: { company: link.company },
      })),
    ];

    if (allEntries.length === 0) return [];

    return await extractJobsWithLLM(allEntries, params);
  }

  async isConfigured(): Promise<boolean> {
    return isFirecrawlConfigured();
  }
}

/* ------------------------------------------------------------------ */
/*  Query building                                                     */
/* ------------------------------------------------------------------ */

function buildSearchQueries(params: JobSearchParams): string[] {
  const base = params.query;
  const loc = params.location || "";
  const remote = params.remote ? "remote" : "";
  const queries: string[] = [];

  // Query 1: Target direct career sites
  queries.push(
    `${base} ${loc} ${remote} apply now 2026`.trim()
  );

  // Query 2: Target specific job board sites
  queries.push(
    `${base} ${loc} ${remote} site:greenhouse.io OR site:lever.co OR site:linkedin.com/jobs/view`.trim()
  );

  // Query 3: Broad search for company career pages
  queries.push(
    `${base} ${loc} ${remote} careers hiring job opening`.trim()
  );

  return queries;
}

/* ------------------------------------------------------------------ */
/*  Search helper                                                      */
/* ------------------------------------------------------------------ */

async function searchMultiple(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  queries: string[]
): Promise<SearchHit[]> {
  const results = await Promise.allSettled(
    queries.map((q) => firecrawlSearch(client, q, 10))
  );

  const allHits: SearchHit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allHits.push(...r.value);
  }
  return allHits;
}

async function firecrawlSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  query: string,
  limit: number
): Promise<SearchHit[]> {
  try {
    const res = await client.search(query, { limit });
    const raw = (res?.data || res?.web || []) as {
      title?: string;
      url?: string;
      description?: string;
    }[];
    return raw
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        description: r.description || "",
      }));
  } catch (e) {
    console.error("Firecrawl search error:", e);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Scrape helper                                                      */
/* ------------------------------------------------------------------ */

async function scrapeMultiple(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (urls.length === 0) return results;

  const scraped = await Promise.allSettled(
    urls.map((url) => scrapeUrl(url))
  );

  for (let i = 0; i < urls.length; i++) {
    const r = scraped[i];
    if (
      r.status === "fulfilled" &&
      r.value.success &&
      r.value.markdown &&
      r.value.markdown.length > 100
    ) {
      results.set(urls[i], r.value.markdown);
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Aggregator page extraction (Stage 4)                               */
/* ------------------------------------------------------------------ */

async function extractJobLinksFromAggregators(
  hits: SearchHit[]
): Promise<{ title: string; company: string; url: string }[]> {
  // Scrape aggregator pages
  const scraped = await scrapeMultiple(hits.map((h) => h.url));
  if (scraped.size === 0) return [];

  let aiProvider;
  try {
    aiProvider = await createAIProvider();
  } catch {
    return []; // No AI = can't extract from aggregators
  }

  const pageContents = hits
    .filter((h) => scraped.has(h.url))
    .map((h) => ({
      url: h.url,
      content: truncate(scraped.get(h.url)!, 3000),
    }));

  if (pageContents.length === 0) return [];

  const prompt = `Extract individual job posting links from these job listing pages. Each page contains multiple job listings.

For each job you can identify, extract:
- title: Job title
- company: Company name
- url: Direct link to the individual job posting (full URL)

Only extract jobs that have a clear title, company, and link. Skip navigation links, ads, or generic links.

Respond with valid JSON: {"jobs": [{"title": "...", "company": "...", "url": "..."}, ...]}

Pages:
${pageContents.map((p) => `Source: ${p.url}\n${p.content}`).join("\n\n---\n\n")}`;

  try {
    const raw = await aiProvider.complete({
      messages: [
        {
          role: "system",
          content: "Extract structured job links from job board listing pages. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 2048,
      temperature: 0,
      responseFormat: "json",
    });

    let jsonStr = raw.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return (parsed.jobs || []).filter(
      (j: { title?: string; company?: string; url?: string }) =>
        j.title && j.company && j.url && j.url.startsWith("http")
    );
  } catch (e) {
    console.error("Aggregator extraction failed:", e);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  LLM job extraction (Stage 6)                                       */
/* ------------------------------------------------------------------ */

async function extractJobsWithLLM(
  entries: {
    title: string;
    url: string;
    description: string;
    markdown: string | null;
    preExtracted?: { company: string };
  }[],
  params: JobSearchParams
): Promise<NormalizedJob[]> {
  let aiProvider;
  try {
    aiProvider = await createAIProvider();
  } catch {
    // No AI — fall back to regex parsing
    return entries
      .map((e) => regexParseJob(e, params))
      .filter(Boolean) as NormalizedJob[];
  }

  const entriesForLLM = entries.map((e, i) => ({
    index: i,
    title: e.title,
    url: e.url,
    description: e.description,
    company: e.preExtracted?.company || "",
    content: e.markdown ? truncate(cleanMarkdown(e.markdown), 1200) : e.description,
  }));

  const prompt = `Extract structured job data from these web pages. Each entry is either a job posting page or a search result.

For each entry, extract:
- jobTitle: Actual job title (e.g. "Senior Software Engineer", NOT "104 jobs in Bangalore")
- company: Hiring company name
- location: Job location
- salary: Compensation if mentioned (null if not)
- isRemote: true/false
- jobType: "full_time", "contract", "part_time", or null
- description: 2-3 sentence role summary from the actual job content
- isRealJob: true ONLY if this is a real individual job posting with a specific role at a specific company

Set isRealJob=false for:
- Aggregation pages ("X jobs in Y city")
- Search results pages
- Company homepages without a specific role
- Blog posts about jobs

Respond with valid JSON only:
{"jobs": [{"index": 0, "jobTitle": "...", "company": "...", "location": "...", "salary": null, "isRemote": false, "jobType": null, "description": "...", "isRealJob": true}]}

Entries:
${entriesForLLM.map((e) => `[${e.index}] Title: ${e.title}${e.company ? ` | Company hint: ${e.company}` : ""}\nURL: ${e.url}\nContent: ${e.content}`).join("\n\n")}`;

  try {
    const raw = await aiProvider.complete({
      messages: [
        {
          role: "system",
          content: "You extract structured job posting data from web content. Be strict: only mark isRealJob=true for actual individual job postings. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 3000,
      temperature: 0,
      responseFormat: "json",
    });

    let jsonStr = raw.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    const extracted = (parsed.jobs || []) as {
      index: number;
      jobTitle: string;
      company: string;
      location: string | null;
      salary: string | null;
      isRemote: boolean;
      jobType: string | null;
      description: string | null;
      isRealJob: boolean;
    }[];

    return extracted
      .filter((j) => j.isRealJob && j.jobTitle && j.company)
      .map((j) => {
        const entry = entries[j.index];
        return {
          externalId: `fc-${normalize(entry?.url || j.jobTitle).slice(0, 50)}`,
          provider: "firecrawl" as const,
          title: j.jobTitle.slice(0, 150),
          company: j.company.slice(0, 100),
          location: j.location || params.location || null,
          salary: j.salary || null,
          salaryMin: null,
          salaryMax: null,
          description: j.description || entry?.description || null,
          jobType: j.jobType || null,
          isRemote: j.isRemote || !!params.remote,
          applyUrl: entry?.url || null,
          companyLogo: null,
          postedAt: null,
          tags: [],
          relevanceScore: null,
          dedupeKey: normalize(j.jobTitle) + "|" + normalize(j.company),
        };
      });
  } catch (e) {
    console.error("LLM job extraction failed:", e);
    return entries
      .map((e) => regexParseJob(e, params))
      .filter(Boolean) as NormalizedJob[];
  }
}

/* ------------------------------------------------------------------ */
/*  Regex fallback                                                     */
/* ------------------------------------------------------------------ */

function regexParseJob(
  entry: { title: string; url: string; description: string; preExtracted?: { company: string } },
  params: JobSearchParams
): NormalizedJob | null {
  const title = entry.title;
  if (!title || title.length < 10) return null;
  if (SKIP_PATTERNS.test(title)) return null;

  let jobTitle = title;
  let company = entry.preExtracted?.company || "Unknown";

  const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[-|·]|$)/i);
  const hiringMatch = title.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s|$)/i);
  const dashMatch = title.match(/^(.+?)\s*[—–|·]\s*(.+?)(?:\s*[—–|·]|$)/);

  if (atMatch) {
    jobTitle = atMatch[1].trim();
    company = atMatch[2].trim();
  } else if (hiringMatch) {
    company = hiringMatch[1].trim();
    jobTitle = hiringMatch[2].trim();
  } else if (dashMatch) {
    const p1 = dashMatch[1].trim();
    const p2 = dashMatch[2].trim();
    if (/engineer|developer|manager|designer|scientist|lead|senior/i.test(p1)) {
      jobTitle = p1;
      if (!entry.preExtracted) company = p2;
    } else {
      jobTitle = p2;
      if (!entry.preExtracted) company = p1;
    }
  }

  jobTitle = jobTitle.replace(/\s*[-|]\s*(Indeed|Glassdoor|LinkedIn|Naukri|Careers|Jobs).*$/i, "").trim();
  company = company.replace(/\s*[-|]\s*(Indeed|Glassdoor|LinkedIn|Naukri|Careers|Jobs).*$/i, "").trim();

  if (jobTitle.length < 3 || jobTitle.length > 150) return null;

  return {
    externalId: `fc-${normalize(entry.url || title).slice(0, 50)}`,
    provider: "firecrawl",
    title: jobTitle.slice(0, 150),
    company: company.slice(0, 100) || "Unknown",
    location: params.location || null,
    salary: null,
    salaryMin: null,
    salaryMax: null,
    description: entry.description || null,
    jobType: null,
    isRemote: /\bremote\b/i.test(title) || !!params.remote,
    applyUrl: entry.url || null,
    companyLogo: null,
    postedAt: null,
    tags: [],
    relevanceScore: null,
    dedupeKey: normalize(jobTitle) + "|" + normalize(company),
  };
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[Skip to[^\]]*\]\([^)]*\)/gi, "")
    .replace(/\[(Apply|Save|Sign in|Show more|Show less)[^\]]*\]\([^)]*\)/gi, "")
    .replace(/^\s*https?:\/\/\S+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}
