import { isFirecrawlConfigured, scrapeUrl } from "@/lib/firecrawl/client";
import type {
  JobSearchProvider,
  JobSearchParams,
  NormalizedJob,
} from "@/types/jobs";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// LinkedIn "f_TPR" time-range filter values (seconds-based)
const TPR_MAP: Record<string, string> = {
  "1d": "r86400",
  "3d": "r259200",
  "7d": "r604800",
  "14d": "r1209600",
  "30d": "r2592000",
};

interface RawCard {
  title: string;
  company: string;
  location: string | null;
  url: string;
  id: string;
}

/**
 * Experimental LinkedIn public/guest job search provider.
 * Scrapes LinkedIn's unauthenticated job search page via Firecrawl.
 * No LinkedIn credentials required.
 */
export class LinkedInPublicProvider implements JobSearchProvider {
  readonly name = "linkedin-public" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    try {
      const url = buildSearchUrl(params);
      const result = await scrapeUrl(url);
      if (!result.success || !result.markdown) return [];

      const cards = parseCards(result.markdown);
      const limit = params.resultsPerPage || 20;

      return cards.slice(0, limit).map((c): NormalizedJob => ({
        externalId: c.id,
        provider: "linkedin-public",
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
      }));
    } catch (e) {
      console.error("LinkedInPublicProvider error:", e);
      return [];
    }
  }

  async isConfigured(): Promise<boolean> {
    return isFirecrawlConfigured();
  }
}

function buildSearchUrl(params: JobSearchParams): string {
  const sp = new URLSearchParams();
  sp.set("keywords", params.query || "");
  if (params.location) sp.set("location", params.location);
  if (params.datePosted && TPR_MAP[params.datePosted]) {
    sp.set("f_TPR", TPR_MAP[params.datePosted]);
  }
  if (params.remote) sp.set("f_WT", "2");
  // Use the guest search endpoint which tends to render server-side markup
  return `https://www.linkedin.com/jobs/search/?${sp.toString()}`;
}

/**
 * Parse LinkedIn job cards from the scraped markdown.
 * The public search page typically renders a list of cards with a link of
 * the form `/jobs/view/<id>` (sometimes absolute). Nearby lines contain the
 * job title, company name, and location.
 */
function parseCards(markdown: string): RawCard[] {
  const cards: RawCard[] = [];
  const seen = new Set<string>();

  // Match any markdown link pointing at a job view page, capturing the id.
  // LinkedIn URLs are usually of the form
  //   /jobs/view/<slug>-at-<company>-<numeric-id>?...
  // or occasionally just /jobs/view/<numeric-id>. Grab the trailing numeric
  // id (anywhere in the slug before the query string).
  const linkRe =
    /\[([^\]]+)\]\((https?:\/\/[^)]*linkedin\.com)?\/jobs\/view\/(?:[^)?]*?-)?(\d{6,})(?:[^)]*)?\)/gi;

  const lines = markdown.split("\n");
  // Build a flat char-offset → line index map for context lookups.
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown)) !== null) {
    const linkText = (match[1] || "").trim();
    const id = match[3];
    if (!id || seen.has(id)) continue;

    // Locate line number of the match for neighbor context
    const before = markdown.slice(0, match.index);
    const lineIdx = before.split("\n").length - 1;

    // Look at context AFTER the title link — LinkedIn renders the card as:
    //   [Job Title](.../jobs/view/...)
    //   ![logo](...)
    //   ### Job Title
    //   #### [Company](/company/<slug>)
    //   <location line>
    //   Actively Hiring / Easy Apply / N applicants
    const ctxEnd = Math.min(lines.length, lineIdx + 10);
    const ctx = lines.slice(lineIdx, ctxEnd);

    let title = stripMd(linkText);
    if (!title || title.length < 3 || /^!\[/.test(title) || /^view job/i.test(title)) {
      for (const l of ctx) {
        const clean = stripMd(l).trim();
        if (clean.length > 5 && clean.length < 120 && !/^https?:/.test(clean)) {
          title = clean;
          break;
        }
      }
    }
    if (!title || title.length < 3) continue;

    // Company: first preference — a link to /company/<slug> in the context.
    let company = "";
    let location: string | null = null;
    const companyLinkRe = /\[([^\]]+)\]\((?:https?:\/\/[^)]*linkedin\.com)?\/company\/[^)]+\)/i;
    for (const l of ctx) {
      const cm = l.match(companyLinkRe);
      if (cm) {
        const txt = stripMd(cm[1]).trim();
        if (txt && txt.length < 80) {
          company = txt;
          break;
        }
      }
    }

    // Location: look for a comma-separated place / "Remote" / "<City>, <ST>".
    for (const l of ctx) {
      const clean = stripMd(l).trim();
      if (!clean || clean === title || clean === company) continue;
      if (clean.length > 80) continue;
      if (/^https?:/.test(clean)) continue;
      if (/\bapplicants?\b|Easy Apply|Actively Hiring/i.test(clean)) continue;
      if (
        !location &&
        (/^Remote$/i.test(clean) ||
          /,\s*[A-Z]{2}\b/.test(clean) ||
          /, (United States|India|Canada|UK|United Kingdom|Germany|France)/i.test(clean))
      ) {
        location = clean;
        break;
      }
    }

    if (!company) continue;

    const url = `https://www.linkedin.com/jobs/view/${id}`;
    cards.push({ title, company, location, url, id });
    seen.add(id);
  }

  return cards;
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
