import type {
  JobSearchProvider,
  JobSearchParams,
  NormalizedJob,
} from "@/types/jobs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioRoot = any;

/* ------------------------------------------------------------------ */
/*  LinkedIn Guest API scraper using Crawlee CheerioCrawler            */
/*  Hits the public /jobs-guest/ endpoints — no auth required          */
/* ------------------------------------------------------------------ */

const GUEST_SEARCH_URL =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const GUEST_DETAIL_URL =
  "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting";

/** LinkedIn's f_TPR time filter uses seconds from now */
const TIME_FILTER: Record<string, string> = {
  "1d": "r86400",
  "3d": "r259200",
  "7d": "r604800",
  "14d": "r1209600",
  "30d": "r2592000",
};

const EXP_LEVEL_MAP: Record<string, string> = {
  entry: "2",      // Entry level
  mid: "3",        // Associate
  senior: "4",     // Mid-Senior level
  lead: "5",       // Director
  executive: "6",  // Executive
};

const JOB_TYPE_MAP: Record<string, string> = {
  full_time: "F",
  part_time: "P",
  contract: "C",
};

interface LinkedInJobCard {
  externalId: string;
  title: string;
  company: string;
  companyUrl: string | null;
  companyLogo: string | null;
  location: string;
  postedAt: string | null;
  link: string;
}

interface LinkedInJobDetail {
  descriptionHtml: string;
  descriptionText: string;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string | null;
  seniorityLevel: string | null;
  applicantsCount: string | null;
  workplaceTypes: string[];
  industries: string[];
  jobFunctions: string[];
}

export class LinkedInProvider implements JobSearchProvider {
  readonly name = "linkedin" as const;

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const { CheerioCrawler, RequestQueue, Configuration } = await import(
      "crawlee"
    );

    // Run Crawlee with in-memory storage so it doesn't pollute the project dir
    const config = new Configuration({ persistStorage: false });

    const jobCards: LinkedInJobCard[] = [];
    const jobDetails = new Map<string, LinkedInJobDetail>();

    const totalWanted = params.resultsPerPage || 25;
    // Fetch extra pages to ensure we get enough after dedup
    const pagesToFetch = Math.ceil(totalWanted / 25);

    const requestQueue = await RequestQueue.open(undefined, { config });

    // Enqueue search pages
    for (let page = 0; page < pagesToFetch; page++) {
      const url = buildSearchUrl(params, page * 25);
      await requestQueue.addRequest({
        url,
        label: "SEARCH",
        userData: { page },
      });
    }

    const crawler = new CheerioCrawler(
      {
        requestQueue,
        maxConcurrency: 3,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 30,
        // Rate limit: 2-4s between requests
        minConcurrency: 1,
        maxRequestsPerMinute: 20,
        requestHandler: async ({ request, $, crawler: c }) => {
          if (request.label === "SEARCH") {
            const cards = parseSearchResults($);
            for (const card of cards) {
              // Dedupe by ID
              if (jobCards.some((j) => j.externalId === card.externalId))
                continue;
              jobCards.push(card);

              // Enqueue detail page
              await c.addRequests([
                {
                  url: `${GUEST_DETAIL_URL}/${card.externalId}`,
                  label: "DETAIL",
                  userData: { jobId: card.externalId },
                },
              ]);
            }
          } else if (request.label === "DETAIL") {
            const detail = parseJobDetail($);
            const jobId = request.userData?.jobId as string;
            if (jobId && detail) {
              jobDetails.set(jobId, detail);
            }
          }
        },
        failedRequestHandler: async ({ request }) => {
          console.warn(
            `LinkedIn crawl failed: ${request.url} (${request.label})`
          );
        },
      },
      config
    );

    await crawler.run();

    // Merge cards + details into NormalizedJob[]
    return jobCards.slice(0, totalWanted).map((card): NormalizedJob => {
      const detail = jobDetails.get(card.externalId);
      const isRemote =
        params.remote ||
        detail?.workplaceTypes?.some((w) =>
          w.toLowerCase().includes("remote")
        ) ||
        card.location?.toLowerCase().includes("remote") ||
        false;

      return {
        externalId: card.externalId,
        provider: "linkedin",
        title: card.title,
        company: card.company,
        location: card.location || null,
        salary: detail?.salary || null,
        salaryMin: detail?.salaryMin || null,
        salaryMax: detail?.salaryMax || null,
        description: detail?.descriptionText || null,
        jobType: normalizeJobType(detail?.employmentType),
        isRemote,
        applyUrl: card.link,
        companyLogo: card.companyLogo || null,
        postedAt: card.postedAt || null,
        tags: [
          ...(detail?.industries || []),
          ...(detail?.jobFunctions || []),
        ].filter(Boolean),
        relevanceScore: null,
        dedupeKey:
          normalize(card.title) + "|" + normalize(card.company),
      };
    });
  }

  async isConfigured(): Promise<boolean> {
    return true; // No API key needed — uses public guest endpoints
  }
}

/* ------------------------------------------------------------------ */
/*  URL builder                                                        */
/* ------------------------------------------------------------------ */

function buildSearchUrl(params: JobSearchParams, start: number): string {
  const qs = new URLSearchParams();
  qs.set("keywords", params.query);
  qs.set("start", String(start));

  if (params.location) qs.set("location", params.location);
  if (params.datePosted && TIME_FILTER[params.datePosted]) {
    qs.set("f_TPR", TIME_FILTER[params.datePosted]);
  }
  if (params.experienceLevel && EXP_LEVEL_MAP[params.experienceLevel]) {
    qs.set("f_E", EXP_LEVEL_MAP[params.experienceLevel]);
  }
  if (params.remote) {
    qs.set("f_WT", "2"); // Remote
  }
  if (params.employmentType?.length) {
    const mapped = params.employmentType
      .map((t) => JOB_TYPE_MAP[t])
      .filter(Boolean);
    if (mapped.length) qs.set("f_JT", mapped.join(","));
  }

  return `${GUEST_SEARCH_URL}?${qs.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Search result parser                                               */
/* ------------------------------------------------------------------ */

function parseSearchResults(
  $: CheerioRoot
): LinkedInJobCard[] {
  const cards: LinkedInJobCard[] = [];

  $("li").each((_: number, el: unknown) => {
    const card = $(el);

    const linkEl = card.find("a.base-card__full-link");
    const href = linkEl.attr("href") || "";
    const idMatch = href.match(/\/view\/[^/]*?(\d+)/);
    if (!idMatch) return;

    const externalId = idMatch[1];
    const title = card.find(".base-search-card__title").text().trim();
    const company = card.find(".base-search-card__subtitle a").text().trim();
    const companyUrl =
      card.find(".base-search-card__subtitle a").attr("href") || null;
    const location = card.find(".job-search-card__location").text().trim();
    const logo =
      card.find("img.artdeco-entity-image").attr("data-delayed-url") ||
      card.find("img.artdeco-entity-image").attr("src") ||
      null;
    const timeEl = card.find("time");
    const postedAt = timeEl.attr("datetime") || null;

    if (title && company) {
      cards.push({
        externalId,
        title,
        company,
        companyUrl,
        companyLogo: logo,
        location,
        postedAt,
        link: href.split("?")[0], // Clean tracking params
      });
    }
  });

  return cards;
}

/* ------------------------------------------------------------------ */
/*  Job detail parser                                                  */
/* ------------------------------------------------------------------ */

function parseJobDetail(
  $: CheerioRoot
): LinkedInJobDetail | null {
  const descriptionEl = $(".show-more-less-html__markup");
  if (!descriptionEl.length) return null;

  const descriptionHtml = descriptionEl.html() || "";
  const descriptionText = descriptionEl.text().trim();

  // Parse job criteria items (Employment type, Seniority, Industries, etc.)
  let employmentType: string | null = null;
  let seniorityLevel: string | null = null;
  const industries: string[] = [];
  const jobFunctions: string[] = [];

  $(".description__job-criteria-item").each((_: number, el: unknown) => {
    const label = $(el)
      .find(".description__job-criteria-subheader")
      .text()
      .trim()
      .toLowerCase();
    const value = $(el)
      .find(".description__job-criteria-text")
      .text()
      .trim();

    if (label.includes("employment type")) employmentType = value;
    else if (label.includes("seniority")) seniorityLevel = value;
    else if (label.includes("industr")) industries.push(value);
    else if (label.includes("function")) jobFunctions.push(value);
  });

  // Parse salary if present
  const { salary, salaryMin, salaryMax } = parseSalary($);

  // Parse workplace type
  const workplaceTypes: string[] = [];
  $(".ui-label.ui-label--accent-3.text-body-small").each((_: number, el: unknown) => {
    const text = $(el).text().trim();
    if (text) workplaceTypes.push(text);
  });
  // Also check the workplace type in criteria section
  $(".workplace-type").each((_: number, el: unknown) => {
    const text = $(el).text().trim();
    if (text) workplaceTypes.push(text);
  });

  // Applicants count
  const applicantsText = $(".num-applicants__caption").text().trim();
  const applicantsMatch = applicantsText.match(/(\d[\d,]*)/);
  const applicantsCount = applicantsMatch ? applicantsMatch[1] : null;

  return {
    descriptionHtml,
    descriptionText,
    salary,
    salaryMin,
    salaryMax,
    employmentType,
    seniorityLevel,
    applicantsCount,
    workplaceTypes,
    industries,
    jobFunctions,
  };
}

/* ------------------------------------------------------------------ */
/*  Salary parser                                                      */
/* ------------------------------------------------------------------ */

function parseSalary($: CheerioRoot): {
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
} {
  // LinkedIn shows salary in a compensation section or inline
  const salaryEl = $(".salary.compensation__salary");
  let salaryText = salaryEl.text().trim();

  if (!salaryText) {
    // Try the compensation section
    $(".compensation__salary-range").each((_: number, el: unknown) => {
      salaryText = $(el).text().trim();
    });
  }

  if (!salaryText) {
    // Try regex on the full page text for patterns like $X - $Y
    const pageText = $("body").text();
    const match = pageText.match(
      /\$[\d,]+(?:\.\d{2})?\s*(?:[-–]\s*\$[\d,]+(?:\.\d{2})?)?(?:\s*\/\s*(?:yr|year|hr|hour))?/
    );
    if (match) salaryText = match[0];
  }

  if (!salaryText) return { salary: null, salaryMin: null, salaryMax: null };

  // Extract numeric values
  const numbers = salaryText.match(/[\d,]+(?:\.\d{2})?/g);
  let salaryMin: number | null = null;
  let salaryMax: number | null = null;

  if (numbers?.length) {
    salaryMin = parseFloat(numbers[0].replace(/,/g, ""));
    if (numbers.length > 1) {
      salaryMax = parseFloat(numbers[1].replace(/,/g, ""));
    }
    // If hourly, annualize (rough estimate)
    if (salaryText.match(/\/\s*h(ou)?r/i) && salaryMin < 500) {
      salaryMin = Math.round(salaryMin * 2080);
      if (salaryMax) salaryMax = Math.round(salaryMax * 2080);
    }
  }

  return {
    salary: salaryText,
    salaryMin,
    salaryMax,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeJobType(type: string | null | undefined): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes("full")) return "full_time";
  if (t.includes("contract")) return "contract";
  if (t.includes("part")) return "part_time";
  if (t.includes("intern")) return "part_time";
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
