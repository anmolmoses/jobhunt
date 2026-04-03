import type { JobSearchProvider, JobSearchParams, NormalizedJob } from "@/types/jobs";

const DATE_MAP: Record<string, number> = {
  "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
};

/**
 * Scrapes HackerNews "Who's Hiring" monthly threads via Algolia API.
 * These are high-quality tech jobs posted by hiring managers directly.
 */
export class HackerNewsProvider implements JobSearchProvider {
  readonly name = "hackernews" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    try {
      // Determine how far back to look based on datePosted
      const maxAgeDays = DATE_MAP[params.datePosted || "30d"] || 30;

      // Find "Who is hiring?" threads, get a few to check recency
      const searchRes = await fetch(
        `https://hn.algolia.com/api/v1/search?query=%22who%20is%20hiring%22&tags=story&hitsPerPage=3`
      );
      if (!searchRes.ok) return [];

      const searchData = await searchRes.json();
      const hits = searchData.hits || [];
      if (hits.length === 0) return [];

      // Filter threads to only those within the date range
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      const recentHits = hits.filter((h: { created_at_i?: number }) =>
        h.created_at_i && h.created_at_i * 1000 >= cutoff
      );
      if (recentHits.length === 0) return [];

      // Use the most recent thread
      const threadId = recentHits[0].objectID;
      const threadTimestamp = recentHits[0].created_at_i
        ? new Date(recentHits[0].created_at_i * 1000).toISOString()
        : new Date().toISOString();

      // Get the comments (job postings) from the thread
      const commentsRes = await fetch(
        `https://hn.algolia.com/api/v1/items/${threadId}`
      );
      if (!commentsRes.ok) return [];

      const thread = await commentsRes.json();
      const comments = thread.children || [];

      // Parse job postings from comments
      const queryTerms = params.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const locationTerms = params.location?.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2) || [];

      const jobs: NormalizedJob[] = [];

      for (const comment of comments) {
        if (!comment.text) continue;

        const text = comment.text as string;
        const textLower = text.toLowerCase();

        // Filter by query
        if (!queryTerms.some((t) => textLower.includes(t))) continue;

        // Filter by location if specified
        if (locationTerms.length > 0 && !locationTerms.some((t) => textLower.includes(t)) && !textLower.includes("remote")) {
          continue;
        }

        // Parse the comment — HN format is typically: "Company | Role | Location | ..."
        const commentTimestamp = comment.created_at_i
          ? new Date(comment.created_at_i * 1000).toISOString()
          : threadTimestamp;
        const parsed = parseHNComment(text, comment.id, commentTimestamp);
        if (parsed) {
          jobs.push(parsed);
        }

        if (jobs.length >= (params.resultsPerPage || 15)) break;
      }

      return jobs;
    } catch (error) {
      console.error("HackerNews error:", error);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

function parseHNComment(html: string, commentId: string, postedAt: string): NormalizedJob | null {
  // Strip HTML tags and decode entities
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&#x22;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))))
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 20) return null;

  // HN format varies: "Company | Role | Location | Remote" or just a paragraph
  const firstLine = text.split("\n")[0] || text.slice(0, 300);
  const parts = firstLine.split("|").map((s) => s.trim()).filter((s) => s.length > 0);
  const isRemote = /\bremote\b/i.test(firstLine);

  let company = "Unknown (HN)";
  let title = "";

  if (parts.length >= 3) {
    // Standard format: Company | Role | Location ...
    company = parts[0];
    // Find the part that looks most like a job title (contains role keywords)
    const roleKeywords = /engineer|developer|designer|manager|lead|architect|scientist|analyst|devops|sre|director|product|data|frontend|backend|fullstack|full.stack|software|senior|staff|principal/i;
    const titlePart = parts.slice(1).find((p) => roleKeywords.test(p));
    title = titlePart || parts[1];
  } else if (parts.length === 2) {
    company = parts[0];
    title = parts[1];
  } else {
    // No pipe format — try to extract from text
    company = parts[0]?.slice(0, 60) || "Unknown (HN)";
    title = extractTitle(text);
  }

  // Fallback: if title still empty or looks like a location/description, try harder
  if (!title || title.length < 5 || /^(http|www\.|[A-Z]{2},?\s)/.test(title)) {
    title = extractTitle(text) || "Engineering Role";
  }

  const location = extractLocation(parts.slice(2).join(" ") + " " + text);

  // Extract URL if present
  const urlMatch = html.match(/href="(https?:\/\/[^"]+)"/);
  const applyUrl = urlMatch
    ? urlMatch[1]
    : `https://news.ycombinator.com/item?id=${commentId}`;

  return {
    externalId: `hn-${commentId}`,
    provider: "hackernews",
    title: title || "Engineering Role",
    company: company.slice(0, 100),
    location: location || (isRemote ? "Remote" : null),
    salary: null,
    salaryMin: null,
    salaryMax: null,
    description: text.slice(0, 2000),
    jobType: "full_time",
    isRemote,
    applyUrl,
    companyLogo: null,
    postedAt,
    tags: ["hackernews"],
    relevanceScore: null,
    dedupeKey: normalize(title || "") + "|" + normalize(company),
  };
}

function extractTitle(text: string): string {
  // Look for common role patterns
  const rolePatterns = [
    /(?:hiring|looking for|seeking)\s+(?:a\s+)?([^.,|]+(?:engineer|developer|designer|manager|lead|architect|scientist)[^.,|]*)/i,
    /(?:role|position):\s*([^.,|]+)/i,
  ];
  for (const p of rolePatterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 80);
  }
  return "";
}

function extractLocation(text: string): string | null {
  const locPatterns = [
    /(?:location|based in|office in)\s*:?\s*([^.,|]+)/i,
    /\b(San Francisco|New York|London|Berlin|Austin|Seattle|Bangalore|Toronto|Remote)\b/i,
  ];
  for (const p of locPatterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 60);
  }
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
