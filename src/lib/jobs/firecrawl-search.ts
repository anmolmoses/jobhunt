import { getFirecrawlClient, isFirecrawlConfigured, scrapeUrl } from "@/lib/firecrawl/client";
import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Firecrawl-powered job search provider.
 * Uses Firecrawl's /v1/search to find jobs from the open web,
 * then scrapes the top results for full job descriptions.
 * This finds jobs from boards we don't have direct API access to.
 */
export class FirecrawlSearchProvider implements JobSearchProvider {
  readonly name = "firecrawl" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const client = await getFirecrawlClient();
    if (!client) throw new Error("Firecrawl not configured");

    // Build search query for job listings
    const queryParts = [params.query];
    if (params.location) queryParts.push(params.location);
    if (params.remote) queryParts.push("remote");
    queryParts.push("jobs hiring");

    const dateHint = params.datePosted === "1d" ? "today" :
      params.datePosted === "3d" ? "this week" :
      params.datePosted === "7d" ? "this week" : "";
    if (dateHint) queryParts.push(dateHint);

    const query = queryParts.join(" ");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchResult = await (client as any).search(query, {
      limit: params.resultsPerPage || 15,
    });

    const results = (searchResult?.data || []) as {
      title?: string;
      description?: string;
      url?: string;
      markdown?: string;
    }[];

    if (results.length === 0) return [];

    // Filter to results that look like job listings
    const jobResults = results.filter((r) => {
      const url = (r.url || "").toLowerCase();
      const title = (r.title || "").toLowerCase();
      // Must be from a job-related source or have job-like title
      return (
        /jobs|careers|hiring|indeed|glassdoor|linkedin|naukri|lever|greenhouse|workday|bamboo|angel\.co|wellfound|ycombinator/i.test(url) ||
        /engineer|developer|manager|analyst|designer|scientist|architect/i.test(title)
      );
    });

    // Parse each result into a NormalizedJob
    const jobs: NormalizedJob[] = [];

    for (const result of jobResults.slice(0, 20)) {
      const parsed = parseJobFromSearchResult(result, params);
      if (parsed) jobs.push(parsed);
    }

    // Try to enrich top results with full descriptions via scrape
    // Scrape up to 5 in parallel for speed
    const toScrape = jobs.filter((j) => j.applyUrl && (!j.description || j.description.length < 200)).slice(0, 5);
    if (toScrape.length > 0) {
      const scrapeResults = await Promise.allSettled(
        toScrape.map((j) => scrapeUrl(j.applyUrl!))
      );

      scrapeResults.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value.success && result.value.markdown) {
          const job = toScrape[i];
          job.description = result.value.markdown.slice(0, 5000);
          // Try to extract more data from the scraped content
          const md = result.value.markdown;
          if (!job.salary) {
            const salaryMatch = md.match(/([\$₹€£]\s*[\d,]+(?:\s*[-–]\s*[\$₹€£]?\s*[\d,]+)?(?:\s*(?:per year|\/yr|annually|LPA|CTC))?)/i);
            if (salaryMatch) job.salary = salaryMatch[1].trim();
          }
        }
      });
    }

    return jobs;
  }

  async isConfigured(): Promise<boolean> {
    return isFirecrawlConfigured();
  }
}

function parseJobFromSearchResult(
  result: { title?: string; description?: string; url?: string },
  params: JobSearchParams
): NormalizedJob | null {
  const title = result.title || "";
  const desc = result.description || "";
  const url = result.url || "";

  if (!title || title.length < 5) return null;

  // Extract job title — often "Job Title at Company" or "Job Title - Company"
  let jobTitle = title;
  let company = "Unknown";

  const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[-|·]|$)/i);
  const dashMatch = title.match(/^(.+?)\s*[-|·]\s*(.+?)(?:\s*[-|·]|$)/);

  if (atMatch) {
    jobTitle = atMatch[1].trim();
    company = atMatch[2].trim();
  } else if (dashMatch) {
    // Determine which part is the title vs company
    const part1 = dashMatch[1].trim();
    const part2 = dashMatch[2].trim();
    const titleKeywords = /engineer|developer|manager|analyst|designer|scientist|architect|lead|senior|junior|intern|head|director|vp/i;
    if (titleKeywords.test(part1)) {
      jobTitle = part1;
      company = part2;
    } else if (titleKeywords.test(part2)) {
      jobTitle = part2;
      company = part1;
    } else {
      jobTitle = part1;
      company = part2;
    }
  }

  // Clean up title — remove trailing site names
  jobTitle = jobTitle.replace(/\s*[-|]\s*(Indeed|Glassdoor|LinkedIn|Naukri|Lever|Greenhouse).*$/i, "").trim();
  company = company.replace(/\s*[-|]\s*(Indeed|Glassdoor|LinkedIn|Naukri|Lever|Greenhouse|Careers|Jobs).*$/i, "").trim();

  if (jobTitle.length < 3 || jobTitle.length > 150) return null;

  // Extract location from description or params
  let location = params.location || null;
  const locMatch = desc.match(/(?:Location|Based in|Office)[:\s]+([A-Z][a-zA-Z\s,]+?)(?:\.|·|$)/i);
  if (locMatch) location = locMatch[1].trim();

  // Detect remote
  const isRemote = /\bremote\b/i.test(title) || /\bremote\b/i.test(desc) || !!params.remote;

  // Extract salary
  let salary: string | null = null;
  const salaryMatch = desc.match(/([\$₹€£]\s*[\d,]+(?:\s*[-–]\s*[\$₹€£]?\s*[\d,]+)?(?:\s*(?:per year|\/yr|annually|LPA|CTC|per annum))?)/i);
  if (salaryMatch) salary = salaryMatch[1].trim();

  return {
    externalId: `fc-${normalize(url || title).slice(0, 50)}`,
    provider: "firecrawl",
    title: jobTitle.slice(0, 150),
    company: company.slice(0, 100) || "Unknown",
    location,
    salary,
    salaryMin: null,
    salaryMax: null,
    description: desc || null,
    jobType: null,
    isRemote,
    applyUrl: url || null,
    companyLogo: null,
    postedAt: null,
    tags: [],
    relevanceScore: null,
    dedupeKey: normalize(jobTitle) + "|" + normalize(company),
  };
}
