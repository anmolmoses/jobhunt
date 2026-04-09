import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getSetting } from "@/lib/settings";

/* ------------------------------------------------------------------ */
/*  LinkedIn Authenticated Scraper                                     */
/*  Uses Puppeteer with manual stealth evasions + li_at cookie         */
/*  Scrapes personalized job feeds (Jobs For You, Alerts, Saved)       */
/* ------------------------------------------------------------------ */

// In-memory state for the running scrape
let activeScrape: { runId: number; aborted: boolean } | null = null;

/** Check if a scrape is currently running */
export function isRunning(): boolean {
  return activeScrape !== null;
}

/** Stop a running scrape */
export function stopScrape(): void {
  if (activeScrape) activeScrape.aborted = true;
}

/** Get time since last run in ms, or null if never run */
export function getTimeSinceLastRun(): number | null {
  const lastRun = db
    .select()
    .from(schema.linkedinScrapeRuns)
    .orderBy(desc(schema.linkedinScrapeRuns.startedAt))
    .limit(1)
    .get();

  if (!lastRun) return null;

  const lastStart = new Date(lastRun.startedAt).getTime();
  return Date.now() - lastStart;
}

// Logging helper
function log(runId: number, level: string, message: string, metadata?: Record<string, unknown>) {
  db.insert(schema.linkedinScrapeLogs)
    .values({
      runId,
      level,
      message,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .run();
}

// Random delay to mimic human behavior
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize for deduplication
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Main scrape function — runs in background, logs progress */
export async function startScrape(): Promise<{ runId: number }> {
  if (activeScrape) {
    throw new Error("A scrape is already running");
  }

  const liAt = await getSetting("linkedin_li_at");
  if (!liAt) {
    throw new Error("LinkedIn li_at cookie not configured. Add it in Settings or on this page.");
  }

  // Create run record
  const run = db
    .insert(schema.linkedinScrapeRuns)
    .values({ status: "running" })
    .returning()
    .get();

  activeScrape = { runId: run.id, aborted: false };

  // Fire and forget — the scrape runs in background
  runScrapeSession(run.id, liAt).catch((err) => {
    console.error("LinkedIn auth scrape fatal error:", err);
    db.update(schema.linkedinScrapeRuns)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        finishedAt: new Date().toISOString(),
      })
      .where(eq(schema.linkedinScrapeRuns.id, run.id))
      .run();
    log(run.id, "error", `Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    activeScrape = null;
  });

  return { runId: run.id };
}

async function runScrapeSession(runId: number, liAt: string): Promise<void> {
  log(runId, "info", "Initializing browser with stealth protections...");

  const puppeteer = await import("puppeteer");

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1920,1080",
      "--disable-dev-shm-usage",
    ],
  });

  let totalFound = 0;
  let totalInserted = 0;
  let pagesScraped = 0;

  try {
    const page = await browser.newPage();

    // --- Manual stealth evasions ---
    // Hide webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // Fake chrome runtime
      // @ts-expect-error - injecting chrome runtime
      window.chrome = { runtime: {} };
      // Fake plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      // Fake languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      // Hide automation-related properties
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: "denied" } as PermissionStatus)
          : originalQuery(parameters);
    });

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );

    // Set timezone to match real browsing
    await page.emulateTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Inject the li_at cookie
    log(runId, "info", "Setting LinkedIn session cookie...");
    await page.setCookie({
      name: "li_at",
      value: liAt,
      domain: ".linkedin.com",
      path: "/",
      httpOnly: true,
      secure: true,
    });

    // Also set language cookie for consistent parsing
    await page.setCookie({
      name: "lang",
      value: "v=2&lang=en-us",
      domain: ".linkedin.com",
      path: "/",
    });

    // Navigate to LinkedIn homepage first (like a human would)
    log(runId, "info", "Navigating to LinkedIn homepage...");
    await page.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await randomDelay(2000, 4000);

    // Check if we're actually logged in
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/authwall") || currentUrl.includes("/checkpoint")) {
      log(runId, "error", "Session cookie expired or invalid — redirected to login page", { url: currentUrl });
      throw new Error("LinkedIn session expired. Please update your li_at cookie.");
    }

    log(runId, "success", "Successfully authenticated with LinkedIn");

    // Scrape each feed section
    const sections = [
      { name: "Recommended Jobs", url: "https://www.linkedin.com/jobs/collections/recommended/" },
      { name: "Job Alerts", url: "https://www.linkedin.com/jobs/collections/" },
    ];

    for (const section of sections) {
      if (activeScrape?.aborted) {
        log(runId, "warn", "Scrape stopped by user");
        break;
      }

      log(runId, "info", `Navigating to ${section.name}...`);

      try {
        await page.goto(section.url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await randomDelay(2000, 4000);

        // Check for redirect (auth issues)
        if (page.url().includes("/login") || page.url().includes("/authwall")) {
          log(runId, "warn", `Redirected away from ${section.name} — skipping`);
          continue;
        }

        // Scroll down incrementally to load more jobs
        const scrollRounds = 8; // ~8 screens of content
        for (let i = 0; i < scrollRounds; i++) {
          if (activeScrape?.aborted) break;

          await page.evaluate(() => {
            window.scrollBy(0, 400 + Math.random() * 300);
          });
          await randomDelay(1000, 2500);
        }

        // Small pause after scrolling
        await randomDelay(1500, 3000);

        // Extract job cards from the page
        const jobs = await page.evaluate(() => {
          const results: Array<{
            externalId: string;
            title: string;
            company: string;
            location: string;
            applyUrl: string;
            companyLogo: string | null;
            postedAt: string | null;
            isEasyApply: boolean;
            salary: string | null;
          }> = [];

          // LinkedIn uses various selectors for job cards across feed types
          const cardSelectors = [
            ".jobs-search-results__list-item",
            ".job-card-container",
            ".jobs-job-board-list__item",
            "[data-job-id]",
            ".scaffold-layout__list-item",
          ];

          const cards = new Set<Element>();
          for (const sel of cardSelectors) {
            document.querySelectorAll(sel).forEach((el) => cards.add(el));
          }

          for (const card of cards) {
            try {
              // Extract job ID
              const jobId =
                card.getAttribute("data-job-id") ||
                card.querySelector("[data-job-id]")?.getAttribute("data-job-id") ||
                (() => {
                  const link = card.querySelector("a[href*='/jobs/view/']");
                  const match = link?.getAttribute("href")?.match(/\/jobs\/view\/(\d+)/);
                  return match?.[1] || null;
                })();

              if (!jobId) return; // skip if no job ID

              // Title
              const titleEl =
                card.querySelector(".job-card-list__title") ||
                card.querySelector(".artdeco-entity-lockup__title") ||
                card.querySelector("a[href*='/jobs/view/']");
              const title = titleEl?.textContent?.trim() || "";

              // Company
              const companyEl =
                card.querySelector(".job-card-container__primary-description") ||
                card.querySelector(".artdeco-entity-lockup__subtitle") ||
                card.querySelector(".job-card-container__company-name");
              const company = companyEl?.textContent?.trim() || "";

              // Location
              const locationEl =
                card.querySelector(".job-card-container__metadata-item") ||
                card.querySelector(".artdeco-entity-lockup__caption");
              const location = locationEl?.textContent?.trim() || "";

              // Logo
              const logoEl = card.querySelector("img[src*='company-logo']") || card.querySelector("img.artdeco-entity-image");
              const companyLogo = logoEl?.getAttribute("src") || null;

              // Apply URL
              const linkEl = card.querySelector("a[href*='/jobs/view/']");
              const applyUrl = linkEl ? `https://www.linkedin.com/jobs/view/${jobId}/` : "";

              // Easy Apply badge
              const isEasyApply = !!card.querySelector(".job-card-container__apply-method") ||
                !!card.textContent?.includes("Easy Apply");

              // Salary (sometimes shown on card)
              const salaryEl = card.querySelector(".job-card-list__salary-info") ||
                card.querySelector("[class*='salary']");
              const salary = salaryEl?.textContent?.trim() || null;

              // Posted time
              const timeEl = card.querySelector("time");
              const postedAt = timeEl?.getAttribute("datetime") || null;

              if (title && company) {
                results.push({
                  externalId: jobId,
                  title,
                  company,
                  location,
                  applyUrl,
                  companyLogo,
                  postedAt,
                  isEasyApply,
                  salary,
                });
              }
            } catch {
              // Skip malformed cards
            }
          }

          return results;
        });

        // Deduplicate within this page
        const seen = new Set<string>();
        const uniqueJobs = (jobs || []).filter((j) => {
          if (seen.has(j.externalId)) return false;
          seen.add(j.externalId);
          return true;
        });

        totalFound += uniqueJobs.length;
        pagesScraped++;
        log(runId, "success", `Found ${uniqueJobs.length} jobs in ${section.name}`, {
          section: section.name,
          count: uniqueJobs.length,
        });

        // Now fetch details for each job
        log(runId, "info", `Fetching details for ${uniqueJobs.length} jobs...`);

        for (let i = 0; i < uniqueJobs.length; i++) {
          if (activeScrape?.aborted) break;

          const job = uniqueJobs[i];
          const dedupeKey = normalize(job.title) + "|" + normalize(job.company);

          // Check if already in DB
          const existing = db
            .select({ id: schema.jobResults.id })
            .from(schema.jobResults)
            .where(eq(schema.jobResults.dedupeKey, dedupeKey))
            .limit(1)
            .get();

          if (existing) {
            continue; // Skip — already have this job
          }

          // Navigate to job detail page for description
          let description: string | null = null;
          let jobType: string | null = null;
          let isRemote = false;
          let salaryMin: number | null = null;
          let salaryMax: number | null = null;
          let detailSalary = job.salary;

          try {
            await page.goto(`https://www.linkedin.com/jobs/view/${job.externalId}/`, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            await randomDelay(1500, 3000);

            const details = await page.evaluate(() => {
              // Description
              const descEl = document.querySelector(".jobs-description__content") ||
                document.querySelector(".jobs-box__html-content") ||
                document.querySelector("[class*='description']");
              const desc = descEl?.textContent?.trim() || null;

              // Job type & workplace from criteria
              const criteria: Record<string, string> = {};
              document.querySelectorAll(".jobs-unified-top-card__job-insight, .job-details-jobs-unified-top-card__job-insight").forEach((el) => {
                const text = el.textContent?.trim() || "";
                if (text.includes("Remote") || text.includes("On-site") || text.includes("Hybrid")) {
                  criteria.workplace = text;
                }
                if (text.includes("Full-time") || text.includes("Part-time") || text.includes("Contract") || text.includes("Internship")) {
                  criteria.jobType = text;
                }
              });

              // Salary from detail page
              let salary: string | null = null;
              const salaryEl = document.querySelector("[class*='salary']") ||
                document.querySelector("[class*='compensation']");
              if (salaryEl) salary = salaryEl.textContent?.trim() || null;

              return { description: desc, criteria, salary };
            });

            description = details.description;

            if (details.criteria.workplace) {
              isRemote = details.criteria.workplace.toLowerCase().includes("remote");
            }
            if (details.criteria.jobType) {
              const jt = details.criteria.jobType.toLowerCase();
              if (jt.includes("full")) jobType = "full_time";
              else if (jt.includes("contract")) jobType = "contract";
              else if (jt.includes("part")) jobType = "part_time";
            }

            // Parse salary
            const salaryText = details.salary || detailSalary;
            if (salaryText) {
              detailSalary = salaryText;
              const numbers = salaryText.match(/[\d,]+(?:\.\d{2})?/g);
              if (numbers?.length) {
                salaryMin = parseFloat(numbers[0].replace(/,/g, ""));
                if (numbers.length > 1) {
                  salaryMax = parseFloat(numbers[1].replace(/,/g, ""));
                }
                // Annualize hourly rates
                if (salaryText.match(/\/\s*h(ou)?r/i) && salaryMin < 500) {
                  salaryMin = Math.round(salaryMin * 2080);
                  if (salaryMax) salaryMax = Math.round(salaryMax * 2080);
                }
              }
            }
          } catch {
            // Detail fetch failed — still insert with card-level data
            log(runId, "warn", `Could not fetch details for: ${job.title} at ${job.company}`);
          }

          // Also check remote from location text
          if (!isRemote && job.location.toLowerCase().includes("remote")) {
            isRemote = true;
          }

          // Insert into jobResults via a dedicated search record
          const searchRecord = getOrCreateSearchRecord(runId);

          db.insert(schema.jobResults)
            .values({
              searchId: searchRecord.id,
              externalId: job.externalId,
              provider: "linkedin-auth",
              title: job.title,
              company: job.company,
              location: job.location || null,
              salary: detailSalary,
              salaryMin,
              salaryMax,
              description,
              jobType,
              isRemote,
              applyUrl: job.applyUrl || `https://www.linkedin.com/jobs/view/${job.externalId}/`,
              companyLogo: job.companyLogo,
              postedAt: job.postedAt,
              tags: JSON.stringify(job.isEasyApply ? ["Easy Apply"] : []),
              relevanceScore: null,
              dedupeKey,
            })
            .run();

          totalInserted++;

          if (totalInserted % 5 === 0) {
            log(runId, "info", `Inserted ${totalInserted} new jobs so far...`);
          }

          // Human-like delay between detail fetches
          await randomDelay(2000, 5000);
        }
      } catch (sectionErr) {
        const msg = sectionErr instanceof Error ? sectionErr.message : String(sectionErr);
        log(runId, "error", `Error scraping ${section.name}: ${msg}`);
      }

      // Pause between sections
      await randomDelay(3000, 6000);
    }

    // Finalize
    const status = activeScrape?.aborted ? "stopped" : "completed";
    db.update(schema.linkedinScrapeRuns)
      .set({
        status,
        jobsFound: totalFound,
        jobsInserted: totalInserted,
        pagesScraped,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(schema.linkedinScrapeRuns.id, runId))
      .run();

    log(runId, "success", `Scrape ${status}. Found ${totalFound} jobs, inserted ${totalInserted} new jobs.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.update(schema.linkedinScrapeRuns)
      .set({
        status: "failed",
        jobsFound: totalFound,
        jobsInserted: totalInserted,
        pagesScraped,
        errorMessage: msg,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(schema.linkedinScrapeRuns.id, runId))
      .run();

    log(runId, "error", `Scrape failed: ${msg}`);
  } finally {
    await browser.close();
    activeScrape = null;
  }
}

// Cache for the search record tied to a scrape run
const searchRecordCache = new Map<number, { id: number }>();

function getOrCreateSearchRecord(runId: number): { id: number } {
  const cached = searchRecordCache.get(runId);
  if (cached) return cached;

  const record = db
    .insert(schema.jobSearches)
    .values({
      query: "LinkedIn Personalized Feed",
      filters: JSON.stringify({ source: "linkedin-auth", runId }),
      providers: JSON.stringify(["linkedin-auth"]),
      totalResults: 0,
    })
    .returning()
    .get();

  searchRecordCache.set(runId, record);
  return record;
}
