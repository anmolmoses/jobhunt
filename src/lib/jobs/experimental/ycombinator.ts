import {
  getFirecrawlClient,
  isFirecrawlConfigured,
  scrapeUrl,
} from "@/lib/firecrawl/client";
import type {
  JobSearchProvider,
  JobSearchParams,
  NormalizedJob,
} from "@/types/jobs";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface RawCard {
  title: string;
  company: string;
  location: string | null;
  url: string;
  id: string;
}

/**
 * Experimental Y Combinator / Work at a Startup job provider.
 * Scrapes the YC jobs board; falls back to Firecrawl web search when the
 * listing page is JS-rendered and yields no parseable cards.
 */
export class YCombinatorProvider implements JobSearchProvider {
  readonly name = "ycombinator" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const limit = params.resultsPerPage || 20;

    // ── Attempt 1: direct scrape of YC jobs listing page ──
    try {
      const url = buildListingUrl(params);
      const result = await scrapeUrl(url);
      if (result.success && result.markdown) {
        const cards = parseCards(result.markdown);
        if (cards.length > 0) {
          return cards.slice(0, limit).map((c) => toNormalized(c, params));
        }
      }
    } catch (e) {
      console.error("YCombinatorProvider direct scrape failed:", e);
    }

    // ── Attempt 2: search-based fallback ──
    try {
      const hits = await searchFallback(params, Math.min(limit, 6));
      if (hits.length === 0) return [];

      // Scrape each hit in parallel for title/company details
      const scrapes = await Promise.allSettled(
        hits.map((h) => scrapeUrl(h.url)),
      );

      const out: NormalizedJob[] = [];
      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const s = scrapes[i];
        const md =
          s.status === "fulfilled" && s.value.success ? s.value.markdown : null;
        const card = cardFromSearchHit(hit, md);
        if (card) out.push(toNormalized(card, params));
      }
      return out;
    } catch (e) {
      console.error("YCombinatorProvider search fallback failed:", e);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    return isFirecrawlConfigured();
  }
}

function toNormalized(c: RawCard, params: JobSearchParams): NormalizedJob {
  return {
    externalId: c.id,
    provider: "ycombinator",
    title: c.title.slice(0, 150),
    company: c.company.slice(0, 100),
    location: c.location || params.location || null,
    salary: null,
    salaryMin: null,
    salaryMax: null,
    description: null,
    jobType: null,
    isRemote: !!params.remote || /\bremote\b/i.test(c.location || ""),
    applyUrl: c.url,
    companyLogo: null,
    postedAt: null,
    tags: [],
    relevanceScore: null,
    dedupeKey: normalize(c.title) + "|" + normalize(c.company),
  };
}

function buildListingUrl(params: JobSearchParams): string {
  const sp = new URLSearchParams();
  if (params.query) sp.set("q", params.query);
  // YC uses coarse role buckets under "role"
  if (params.query) sp.set("role", params.query);
  const qs = sp.toString();
  return `https://www.ycombinator.com/jobs${qs ? "?" + qs : ""}`;
}

/**
 * Parse cards from the YC jobs listing markdown.
 * YC job links are typically /companies/<company-slug>/jobs/<id>-<slug> on the
 * main site or /jobs/<id>-<slug> on workatastartup.com.
 */
function parseCards(markdown: string): RawCard[] {
  const cards: RawCard[] = [];
  const seen = new Set<string>();

  // Match YC or workatastartup job URLs.
  // YC job ids can be alphanumeric (e.g. "vqgGG8a") or numeric, and the
  // trailing slug is optional.
  const linkRe =
    /\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:ycombinator\.com|workatastartup\.com))?(\/(?:companies\/([a-z0-9-]+)\/)?jobs\/([A-Za-z0-9]{3,})(?:-([a-z0-9-]+))?)\)/gi;

  const lines = markdown.split("\n");
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown)) !== null) {
    const linkText = stripMd(match[1] || "").trim();
    const host = match[2] || "https://www.ycombinator.com";
    const path = match[3];
    const companySlug = match[4] || null;
    const id = match[5];
    const slug = match[6] || "";
    if (!id || seen.has(id)) continue;
    // Skip known non-job paths (role, category, location listings).
    if (/^(role|location|category|industry|company|companies)$/i.test(id)) continue;
    // Require either a company-scoped path, or an id that looks like a real
    // YC job id (mixed-case alphanumeric, typically 6-10 chars) or numeric.
    const looksLikeJobId = /\d/.test(id) || /[A-Z]/.test(id);
    if (!companySlug && !looksLikeJobId) continue;

    const before = markdown.slice(0, match.index);
    const lineIdx = before.split("\n").length - 1;
    const ctxStart = Math.max(0, lineIdx - 4);
    const ctxEnd = Math.min(lines.length, lineIdx + 5);
    const ctx = lines.slice(ctxStart, ctxEnd);

    let title = linkText;
    if (!title || title.length < 3 || /^!\[/.test(match[1] || "")) {
      title = slug
        ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "";
    }
    if (!title || title.length < 3) continue;

    let company = companySlug
      ? companySlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    let location: string | null = null;
    for (const l of ctx) {
      const clean = stripMd(l).trim();
      if (!clean || clean === title || clean === company) continue;
      if (clean.length > 80) continue;
      if (/^https?:/.test(clean)) continue;
      if (
        !location &&
        (/\bRemote\b/i.test(clean) ||
          /,\s*[A-Z]{2}\b/.test(clean) ||
          /\b(San Francisco|New York|London|Berlin|Bangalore|Remote)\b/i.test(clean))
      ) {
        location = clean;
        continue;
      }
      if (!company && /^[A-Z0-9]/.test(clean)) {
        company = clean;
      }
    }
    if (!company) continue;

    const url = `${host}${path}`.replace(/^https?:\/\/\/+/, "https://");
    cards.push({ title, company, location, url, id });
    seen.add(id);
  }

  return cards;
}

interface SearchHit {
  title: string;
  url: string;
  description: string;
}

async function searchFallback(
  params: JobSearchParams,
  limit: number,
): Promise<SearchHit[]> {
  const client = await getFirecrawlClient();
  if (!client) return [];
  const q = `site:workatastartup.com ${params.query || ""}${
    params.location ? " " + params.location : ""
  }${params.remote ? " remote" : ""}`.trim();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client as any).search(q, { limit });
    const raw = (res?.data || res?.web || []) as {
      title?: string;
      url?: string;
      description?: string;
    }[];
    return raw
      .filter((r) => r.url && r.title && /workatastartup\.com\/jobs\//.test(r.url))
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        description: r.description || "",
      }));
  } catch (e) {
    console.error("YC search fallback error:", e);
    return [];
  }
}

function cardFromSearchHit(
  hit: SearchHit,
  markdown: string | null,
): RawCard | null {
  // URL shape: .../jobs/<id>-<slug>
  const m = hit.url.match(/\/jobs\/(\d{3,})-([a-z0-9-]+)/i);
  if (!m) return null;
  const id = m[1];
  const slug = m[2];

  // Title from search-hit title, prefer "Role at Company" split
  let title = hit.title.trim();
  let company = "";
  const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[-|·]|$)/i);
  if (atMatch) {
    title = atMatch[1].trim();
    company = atMatch[2].trim();
  }

  if (!title) {
    title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Try to pluck company from scraped markdown if we don't have it.
  if (!company && markdown) {
    const h1 = markdown.match(/^#\s+(.+)$/m);
    if (h1) company = stripMd(h1[1]).trim();
    if (!company) {
      const atM = markdown.match(/at\s+([A-Z][A-Za-z0-9&.\- ]{2,50})/);
      if (atM) company = atM[1].trim();
    }
  }

  if (!company) return null;

  return { title, company, location: null, url: hit.url, id };
}

function stripMd(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
}
