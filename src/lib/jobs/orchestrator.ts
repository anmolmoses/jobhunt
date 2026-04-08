import { JSearchProvider } from "./jsearch";
import { AdzunaProvider } from "./adzuna";
import { RemotiveProvider } from "./remotive";
import { LinkedInProvider } from "./linkedin";
import { IndeedProvider } from "./indeed";
import { RemoteOKProvider } from "./remoteok";
import { JobicyProvider } from "./jobicy";
import { HackerNewsProvider } from "./hackernews";
import { FirecrawlSearchProvider } from "./firecrawl-search";
import { GreenhouseProvider } from "./greenhouse";
import { scoreATSMatch } from "./ats-score";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getCompanyLogoUrl } from "@/lib/company/logo";
import type { JobSearchParams, NormalizedJob } from "@/types/jobs";

interface UserPreferences {
  experienceLevel: string;
  excludeKeywords: string[];
  desiredSkills: string[];
  desiredRoles: string[];
  locationPreference: string[];
  preferredLocations: string[];
}

function loadPreferences(): UserPreferences | null {
  const prefs = db
    .select()
    .from(schema.jobPreferences)
    .orderBy(desc(schema.jobPreferences.updatedAt))
    .limit(1)
    .get();

  if (!prefs) return null;

  const safeParse = (s: string, fallback: unknown = []) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  return {
    experienceLevel: prefs.experienceLevel,
    excludeKeywords: safeParse(prefs.excludeKeywords, []),
    desiredSkills: safeParse(prefs.desiredSkills, []),
    desiredRoles: safeParse(prefs.desiredRoles, []),
    locationPreference: (() => {
      const v = safeParse(prefs.locationPreference, null);
      return Array.isArray(v) ? v : [prefs.locationPreference];
    })(),
    preferredLocations: safeParse(prefs.preferredLocations, []),
  };
}

const providers = [
  new LinkedInProvider(),
  new IndeedProvider(),
  new JSearchProvider(),
  new AdzunaProvider(),
  new RemotiveProvider(),
  new RemoteOKProvider(),
  new JobicyProvider(),
  new HackerNewsProvider(),
  new FirecrawlSearchProvider(),
  new GreenhouseProvider(),
];

interface SearchResult {
  jobs: NormalizedJob[];
  searchId: number;
  providerResults: { provider: string; count: number; error?: string }[];
}

export async function searchJobs(
  params: JobSearchParams,
  enabledProviders?: string[]
): Promise<SearchResult> {
  // Filter to enabled and configured providers
  const activeProviders: (typeof providers)[number][] = [];
  for (const p of providers) {
    if (enabledProviders && !enabledProviders.includes(p.name)) continue;
    if (await p.isConfigured()) {
      activeProviders.push(p);
    }
  }

  if (activeProviders.length === 0) {
    throw new Error("No job search providers configured. Please add API keys in Settings.");
  }

  // Search all providers in parallel
  const results = await Promise.allSettled(
    activeProviders.map((p) => p.search(params))
  );

  const allJobs: NormalizedJob[] = [];
  const providerResults: { provider: string; count: number; error?: string }[] = [];

  results.forEach((result, i) => {
    const providerName = activeProviders[i].name;
    if (result.status === "fulfilled") {
      allJobs.push(...result.value);
      providerResults.push({ provider: providerName, count: result.value.length });
    } else {
      console.error(`${providerName} search failed:`, result.reason);
      providerResults.push({
        provider: providerName,
        count: 0,
        error: result.reason?.message || "Unknown error",
      });
    }
  });

  // Enforce date filter as a safety net — regardless of what providers return
  const DATE_DAYS: Record<string, number> = {
    "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30,
  };
  const maxAgeDays = DATE_DAYS[params.datePosted || "30d"] || 30;
  // Allow 2x the requested window to avoid being too aggressive with timezone/clock skew
  const dateCutoff = new Date(Date.now() - maxAgeDays * 2 * 24 * 60 * 60 * 1000);
  const dateFiltered = allJobs.filter((job) => {
    if (!job.postedAt) return true; // Keep jobs with unknown dates (some providers don't report)
    const jobDate = new Date(job.postedAt);
    return jobDate >= dateCutoff;
  });

  // Deduplicate
  const deduped = deduplicateJobs(dateFiltered);

  // Load user preferences for filtering and scoring
  const userPrefs = loadPreferences();

  // Filter out jobs that match exclude keywords
  const filtered = userPrefs ? filterJobs(deduped, userPrefs) : deduped;

  // Score relevance using preferences
  const scored = scoreJobs(filtered, params, userPrefs);

  // ATS keyword match scoring — compare each job to resume
  const latestResume = db
    .select()
    .from(schema.resumes)
    .orderBy(desc(schema.resumes.createdAt))
    .limit(1)
    .get();

  if (latestResume?.parsedText) {
    for (const job of scored) {
      if (job.description) {
        const ats = scoreATSMatch(latestResume.parsedText, job.description);
        job.atsScore = ats.score;
      }
    }
  }

  // Sort by relevance
  scored.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  // Enrich logos via logo.dev for jobs missing logos
  const seenCompanies = new Set<string>();
  for (const job of scored) {
    if (!job.companyLogo && !seenCompanies.has(job.company.toLowerCase())) {
      seenCompanies.add(job.company.toLowerCase());
      try {
        const logoUrl = await getCompanyLogoUrl(job.company, null);
        if (logoUrl) {
          // Apply to all jobs from this company
          for (const j of scored) {
            if (j.company.toLowerCase() === job.company.toLowerCase() && !j.companyLogo) {
              j.companyLogo = logoUrl;
            }
          }
        }
      } catch {
        // Logo enrichment is best-effort
      }
    }
  }

  // Persist search to DB
  const search = db
    .insert(schema.jobSearches)
    .values({
      query: params.query,
      filters: JSON.stringify({
        location: params.location,
        remote: params.remote,
        datePosted: params.datePosted,
        salaryMin: params.salaryMin,
        employmentType: params.employmentType,
      }),
      providers: JSON.stringify(activeProviders.map((p) => p.name)),
      totalResults: scored.length,
    })
    .returning()
    .get();

  // Persist job results with cross-search deduplication
  // Skip jobs that already exist in the DB from previous searches
  const jobsWithIds = scored.map((job) => {
    const existing = db
      .select({ id: schema.jobResults.id })
      .from(schema.jobResults)
      .where(eq(schema.jobResults.dedupeKey, job.dedupeKey))
      .limit(1)
      .get();

    if (existing) {
      // Already in DB from a previous search — reuse existing ID
      return { ...job, dbId: existing.id };
    }

    const inserted = db.insert(schema.jobResults)
      .values({
        searchId: search.id,
        externalId: job.externalId,
        provider: job.provider,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        description: job.description,
        jobType: job.jobType,
        isRemote: job.isRemote,
        applyUrl: job.applyUrl,
        companyLogo: job.companyLogo,
        postedAt: job.postedAt,
        tags: JSON.stringify(job.tags),
        relevanceScore: job.relevanceScore,
        dedupeKey: job.dedupeKey,
      })
      .returning()
      .get();

    return { ...job, dbId: inserted.id };
  });

  return {
    jobs: jobsWithIds,
    searchId: search.id,
    providerResults,
  };
}

function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    const existing = seen.get(job.dedupeKey);
    if (!existing) {
      seen.set(job.dedupeKey, job);
    } else {
      // Keep the one with more data
      const existingScore = dataRichness(existing);
      const newScore = dataRichness(job);
      if (newScore > existingScore) {
        seen.set(job.dedupeKey, job);
      }
    }
  }

  return Array.from(seen.values());
}

function dataRichness(job: NormalizedJob): number {
  let score = 0;
  if (job.salary) score += 2;
  if (job.description && job.description.length > 100) score += 2;
  if (job.companyLogo) score += 1;
  if (job.tags.length > 0) score += 1;
  if (job.postedAt) score += 1;
  if (job.applyUrl) score += 1;
  return score;
}

// Engineering role keywords — job titles must contain at least one to be relevant
const ENGINEERING_ROLE_KEYWORDS = [
  "engineer", "developer", "architect", "sde", "swe",
  "backend", "back end", "back-end", "frontend", "front end", "front-end",
  "software", "platform", "devops", "sre", "infrastructure",
  "full stack", "fullstack", "full-stack",
  "programmer", "technical", "cto", "vp engineering",
  "data scientist", "data engineer", "machine learning", "ml engineer",
  "python", "java", "golang", "rust", "node",
  "mts", "consultant",
];

/**
 * Filter out jobs that don't match the user's profile.
 * - Remove jobs whose title has zero engineering role keywords
 * - Remove jobs with exclude keywords in title
 * - Remove jobs clearly below experience level (intern/fresher for senior, etc.)
 * - Remove jobs outside preferred locations (unless remote)
 */
function filterJobs(jobs: NormalizedJob[], prefs: UserPreferences): NormalizedJob[] {
  const excludeKeywords = prefs.excludeKeywords.map((k) => k.toLowerCase());
  const locationTerms = (prefs.preferredLocations || []).flatMap((l) =>
    l.toLowerCase().split(/[\s,]+/).filter((t: string) => t.length > 2)
  );
  const hasLocationPrefs = locationTerms.length > 0;

  // Experience level seniority for filtering
  const SENIORITY: Record<string, number> = {
    intern: 0, internship: 0, trainee: 0, fresher: 0,
    entry: 1, junior: 1, "entry level": 1,
    associate: 2,
    mid: 3,
    senior: 4, lead: 5, staff: 5, principal: 5,
    director: 6, executive: 6, vp: 6, head: 6, manager: 5,
  };

  const userSeniority = SENIORITY[prefs.experienceLevel] ?? 3;

  return jobs.filter((job) => {
    const titleLower = job.title.toLowerCase();
    const descLower = (job.description || "").toLowerCase().slice(0, 500);

    // Hard filter: title must contain at least one engineering role keyword
    const isEngineeringRole = ENGINEERING_ROLE_KEYWORDS.some((kw) => titleLower.includes(kw));
    if (!isEngineeringRole) return false;

    // Filter by exclude keywords (check title + start of description)
    for (const kw of excludeKeywords) {
      if (titleLower.includes(kw)) return false;
      // Only filter description for strong exclude words
      if (kw.length > 3 && descLower.includes(kw) && !titleLower.includes("senior") && !titleLower.includes("lead")) {
        // Don't exclude if the title is clearly senior
      }
    }

    // Filter by experience level mismatch
    // If user is senior (4), filter out intern (0), entry (1), junior (1)
    if (userSeniority >= 4) {
      const juniorSignals = ["intern", "internship", "trainee", "fresher", "junior", "entry level", "graduate", "entry-level"];
      if (juniorSignals.some((s) => titleLower.includes(s))) return false;
    }
    if (userSeniority >= 3) {
      const internSignals = ["intern", "internship", "trainee", "fresher"];
      if (internSignals.some((s) => titleLower.includes(s))) return false;
    }

    // Filter out years-of-experience mismatches from title
    // e.g. "(1-3 years)" when user is senior
    const yoeMatch = titleLower.match(/\((\d+)[-–](\d+)\s*(?:yr|year)/);
    if (yoeMatch && userSeniority >= 4) {
      const maxYoe = parseInt(yoeMatch[2]);
      if (maxYoe <= 3) return false; // Filter "1-3 years" for senior engineers
    }

    // Hard filter: location must match preferred locations or be remote
    if (hasLocationPrefs) {
      const jobLocLower = (job.location || "").toLowerCase();
      const isRemote = job.isRemote || jobLocLower.includes("remote") || jobLocLower.includes("worldwide") || jobLocLower.includes("anywhere");
      const locationMatch = locationTerms.some((t) => jobLocLower.includes(t));
      // Allow remote, location match, or empty location (unknown)
      if (!isRemote && !locationMatch && jobLocLower.length > 0) return false;
    }

    return true;
  });
}

function scoreJobs(jobs: NormalizedJob[], params: JobSearchParams, prefs?: UserPreferences | null): NormalizedJob[] {
  const queryTerms = params.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const locationTerms = params.location
    ? params.location.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2)
    : (prefs?.preferredLocations || []).flatMap((l) => l.toLowerCase().split(/[\s,]+/).filter((t: string) => t.length > 2));
  const hasLocation = locationTerms.length > 0;

  // Build skill terms from preferences for matching
  const skillTerms = (prefs?.desiredSkills || []).map((s) => s.toLowerCase());
  const roleTerms = (prefs?.desiredRoles || []).flatMap((r) =>
    r.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  );

  // Seniority signals boost
  const senioritySignals = prefs?.experienceLevel === "senior"
    ? ["senior", "sr.", "staff", "principal", "lead", "architect"]
    : prefs?.experienceLevel === "lead"
    ? ["lead", "staff", "principal", "head", "director", "manager"]
    : [];

  return jobs.map((job) => {
    let score = 0;
    const titleLower = job.title.toLowerCase();
    const descLower = (job.description || "").toLowerCase();
    const jobLocLower = (job.location || "").toLowerCase();

    // === 1. LOCATION MATCH (30% when location specified) ===
    if (hasLocation) {
      const fullMatch = locationTerms.every((t) => jobLocLower.includes(t));
      const partialMatch = locationTerms.some((t) => jobLocLower.includes(t));

      if (fullMatch) score += 0.30;
      else if (partialMatch) score += 0.18;
      else if (job.isRemote) score += 0.12; // Remote gets partial credit
      // No match + not remote = 0 (tanks ranking)
    } else if (job.isRemote) {
      score += 0.10;
    }

    // === 2. ROLE/TITLE MATCH (25%) ===
    // Check if the job title matches any desired role
    const roleMatch = roleTerms.filter((t) => titleLower.includes(t)).length;
    const roleScore = Math.min(roleMatch / Math.max(roleTerms.length / 3, 1), 1);
    score += roleScore * 0.15;

    // Query term match in title
    const queryMatch = queryTerms.filter((t) => titleLower.includes(t)).length;
    score += (queryMatch / Math.max(queryTerms.length, 1)) * 0.10;

    // === 3. SENIORITY MATCH (15%) ===
    if (senioritySignals.length > 0) {
      const hasSeniorSignal = senioritySignals.some((s) => titleLower.includes(s));
      score += hasSeniorSignal ? 0.15 : 0.02;
    } else {
      score += 0.05; // Neutral
    }

    // === 4. SKILLS MATCH (15%) ===
    if (skillTerms.length > 0) {
      const textToSearch = titleLower + " " + descLower.slice(0, 2000);
      const skillMatches = skillTerms.filter((s) => textToSearch.includes(s)).length;
      const skillRatio = skillMatches / Math.min(skillTerms.length, 15); // Cap at 15 skills for ratio
      score += Math.min(skillRatio, 1) * 0.15;
    }

    // === 5. RECENCY (10%) ===
    if (job.postedAt) {
      const daysOld = (Date.now() - new Date(job.postedAt).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 1 - daysOld / 30) * 0.10;
    }

    // === 6. SALARY FIT (5%) ===
    if (params.salaryMin && job.salaryMin) {
      score += job.salaryMin >= params.salaryMin ? 0.05 : 0.02;
    }

    return { ...job, relevanceScore: Math.round(score * 100) / 100 };
  });
}
