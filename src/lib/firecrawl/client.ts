import FirecrawlApp from "@mendable/firecrawl-js";
import { getSetting } from "@/lib/settings";

let cachedClient: FirecrawlApp | null = null;
let cachedUrl: string | null = null;

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
 * Scrape a full job description from the apply URL.
 * Useful when provider-supplied descriptions are truncated.
 */
export async function scrapeJobDescription(applyUrl: string): Promise<string | null> {
  const result = await scrapeUrl(applyUrl);
  if (!result.success || !result.markdown) return null;

  // The raw page likely has nav, footer, etc. Return a reasonable chunk.
  return result.markdown.slice(0, 8000);
}
