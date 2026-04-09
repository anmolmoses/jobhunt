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
          waitUntil: "networkidle2",
          timeout: 45000,
        });
        await randomDelay(3000, 5000);

        // Check for redirect (auth issues)
        const landedUrl = page.url();
        log(runId, "info", `Landed on: ${landedUrl}`);
        if (landedUrl.includes("/login") || landedUrl.includes("/authwall")) {
          log(runId, "warn", `Redirected away from ${section.name} — skipping`);
          continue;
        }

        // Wait for the job list to render — try multiple possible containers
        const listSelectors = [
          ".scaffold-layout__list",
          ".jobs-search-results-list",
          ".jobs-search-results__list",
          "[class*='jobs-search-results']",
          "ul.jobs-search__results-list",
          "main",
        ];
        for (const sel of listSelectors) {
          try {
            await page.waitForSelector(sel, { timeout: 5000 });
            log(runId, "info", `Found container: ${sel}`);
            break;
          } catch {
            // Try next
          }
        }

        // Scroll down incrementally to load more jobs
        const scrollRounds = 10;
        for (let i = 0; i < scrollRounds; i++) {
          if (activeScrape?.aborted) break;

          await page.evaluate(() => {
            window.scrollBy(0, 400 + Math.random() * 300);
          });
          await randomDelay(1000, 2500);
        }

        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await randomDelay(1500, 3000);

        // Diagnostic: dump the page structure to understand what selectors exist
        const diagnostics = await page.evaluate(() => {
          const info: Record<string, number> = {};
          // Check a wide range of possible selectors
          const testSelectors = [
            "li", "a[href*='/jobs/view/']", "[data-job-id]",
            "[data-occludable-job-id]", "[data-entity-urn]",
            ".job-card-container", ".job-card-list",
            ".jobs-search-results__list-item",
            ".scaffold-layout__list-item",
            ".jobs-job-board-list__item",
            ".artdeco-entity-lockup",
            "[class*='job-card']", "[class*='jobs-search']",
            "[class*='scaffold']", "[class*='entity-result']",
            ".ember-view",
          ];
          for (const sel of testSelectors) {
            try {
              info[sel] = document.querySelectorAll(sel).length;
            } catch { /* skip invalid */ }
          }

          // Also grab the first job link href if any exist
          const firstJobLink = document.querySelector("a[href*='/jobs/view/']");
          if (firstJobLink) {
            info["__firstJobHref"] = 1;
          }

          // Get a snippet of the main content area for debugging
          const main = document.querySelector("main") || document.querySelector("[role='main']") || document.body;
          const snippet = main?.innerHTML?.substring(0, 2000) || "NO MAIN CONTENT";

          return { selectorCounts: info, htmlSnippet: snippet };
        });

        log(runId, "info", `DOM selectors found: ${JSON.stringify(diagnostics.selectorCounts)}`);
        log(runId, "info", `Page HTML snippet (first 500 chars): ${diagnostics.htmlSnippet.substring(0, 500)}`);

        // Extract job cards from the page using broad strategy
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

          // Strategy 1: Find all links to /jobs/view/ and work outward
          const jobLinks = document.querySelectorAll("a[href*='/jobs/view/']");
          const seen = new Set<string>();

          for (const link of jobLinks) {
            const href = link.getAttribute("href") || "";
            const match = href.match(/\/jobs\/view\/(\d+)/);
            if (!match) continue;
            const jobId = match[1];
            if (seen.has(jobId)) continue;
            seen.add(jobId);

            // Walk up to find the card container (usually a <li> or a div with data attributes)
            let card: Element | null = link;
            for (let i = 0; i < 8; i++) {
              if (!card.parentElement) break;
              card = card.parentElement;
              if (card.tagName === "LI" || card.getAttribute("data-job-id") || card.getAttribute("data-occludable-job-id")) break;
            }

            // Title — the link text itself is often the title, or a child element
            const title = (
              link.textContent?.trim() ||
              card.querySelector("[class*='title']")?.textContent?.trim() ||
              ""
            ).replace(/\n/g, " ").replace(/\s+/g, " ");

            // Company — look for subtitle or secondary text
            const company = (
              card.querySelector("[class*='subtitle'], [class*='company'], [class*='primary-description']")?.textContent?.trim() ||
              card.querySelector("[class*='artdeco-entity-lockup__subtitle']")?.textContent?.trim() ||
              ""
            ).replace(/\n/g, " ").replace(/\s+/g, " ");

            // Location — caption or metadata
            const location = (
              card.querySelector("[class*='caption'], [class*='location'], [class*='metadata']")?.textContent?.trim() ||
              ""
            ).replace(/\n/g, " ").replace(/\s+/g, " ");

            // Logo
            const logoEl = card.querySelector("img[src*='company-logo'], img[src*='shrink']");
            const companyLogo = logoEl?.getAttribute("src") || null;

            const applyUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;

            // Easy Apply
            const isEasyApply = !!(card.textContent?.includes("Easy Apply"));

            // Salary
            const salaryEl = card.querySelector("[class*='salary']");
            const salary = salaryEl?.textContent?.trim() || null;

            // Posted time
            const timeEl = card.querySelector("time");
            const postedAt = timeEl?.getAttribute("datetime") || null;

            if (title) {
              results.push({
                externalId: jobId,
                title: title.substring(0, 200),
                company: company.substring(0, 200),
                location: location.substring(0, 200),
                applyUrl,
                companyLogo,
                postedAt,
                isEasyApply,
                salary,
              });
            }
          }

          // Strategy 2: data-occludable-job-id (LinkedIn's lazy-loaded cards)
          if (results.length === 0) {
            const occludableCards = document.querySelectorAll("[data-occludable-job-id]");
            for (const card of occludableCards) {
              const jobId = card.getAttribute("data-occludable-job-id");
              if (!jobId || seen.has(jobId)) continue;
              seen.add(jobId);

              const title = card.querySelector("a")?.textContent?.trim()?.replace(/\n/g, " ").replace(/\s+/g, " ") || "";
              const company = card.querySelector("[class*='subtitle']")?.textContent?.trim() || "";
              const location = card.querySelector("[class*='caption']")?.textContent?.trim() || "";
              const logoEl = card.querySelector("img");
              const companyLogo = logoEl?.getAttribute("src") || null;

              if (title) {
                results.push({
                  externalId: jobId,
                  title: title.substring(0, 200),
                  company: company.substring(0, 200),
                  location: location.substring(0, 200),
                  applyUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
                  companyLogo,
                  postedAt: null,
                  isEasyApply: !!(card.textContent?.includes("Easy Apply")),
                  salary: null,
                });
              }
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
