import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { scrapeUrl } from "@/lib/firecrawl/client";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  departments: { name: string }[];
  absolute_url: string;
  content: string;
  updated_at: string;
}

interface LeverJob {
  id: string;
  text: string;
  categories: { location?: string; department?: string; team?: string };
  hostedUrl: string;
  descriptionPlain: string;
  createdAt: number;
}

interface ScanResult {
  externalId: string;
  title: string;
  department: string | null;
  location: string | null;
  applyUrl: string | null;
  description: string | null;
  isRemote: boolean;
  postedAt: string | null;
}

async function scanGreenhouse(portal: typeof schema.companyPortals.$inferSelect): Promise<ScanResult[]> {
  const endpoint = portal.apiEndpoint
    ? `${portal.apiEndpoint}?content=true`
    : `https://boards-api.greenhouse.io/v1/boards/${portal.normalizedName}/jobs?content=true`;

  const res = await fetch(endpoint, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Greenhouse API returned ${res.status}`);

  const data = await res.json();
  const jobs: GreenhouseJob[] = data.jobs || [];

  return jobs.map((job) => ({
    externalId: String(job.id),
    title: job.title,
    department: job.departments?.[0]?.name || null,
    location: job.location?.name || null,
    applyUrl: job.absolute_url || null,
    description: job.content ? job.content.slice(0, 5000) : null,
    isRemote: /remote/i.test(job.location?.name || ""),
    postedAt: job.updated_at || null,
  }));
}

async function scanLever(portal: typeof schema.companyPortals.$inferSelect): Promise<ScanResult[]> {
  // Extract slug from careersUrl or normalizedName
  const slug = portal.careersUrl.match(/lever\.co\/([^/?]+)/)?.[1] || portal.normalizedName;
  const endpoint = `https://api.lever.co/v0/postings/${slug}`;

  const res = await fetch(endpoint, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Lever API returned ${res.status}`);

  const jobs: LeverJob[] = await res.json();

  return jobs.map((job) => ({
    externalId: job.id,
    title: job.text,
    department: job.categories?.department || job.categories?.team || null,
    location: job.categories?.location || null,
    applyUrl: job.hostedUrl || null,
    description: job.descriptionPlain ? job.descriptionPlain.slice(0, 5000) : null,
    isRemote: /remote/i.test(job.categories?.location || ""),
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
  }));
}

async function scanFirecrawl(portal: typeof schema.companyPortals.$inferSelect): Promise<ScanResult[]> {
  const result = await scrapeUrl(portal.careersUrl);
  if (!result.success || !result.markdown) return [];

  // Parse job listings from markdown content
  // Look for patterns like "## Job Title" or "- Job Title" with links
  const jobs: ScanResult[] = [];
  const lines = result.markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match markdown links that look like job titles: [Job Title](url)
    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();

      // Filter out navigation/generic links
      if (
        title.length < 5 ||
        title.length > 120 ||
        /^(home|about|contact|blog|sign|log|apply|menu|skip|back|next|prev)/i.test(title)
      ) {
        continue;
      }

      // Look for location info on nearby lines
      let location: string | null = null;
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) {
        if (j === i) continue;
        const nearby = lines[j].trim();
        const locMatch = nearby.match(/(?:location|office|city)[\s:]+([^\n|]+)/i);
        if (locMatch) {
          location = locMatch[1].trim();
          break;
        }
      }

      jobs.push({
        externalId: url,
        title,
        department: null,
        location,
        applyUrl: url.startsWith("http") ? url : `${portal.careersUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`,
        description: null,
        isRemote: /remote/i.test(title) || /remote/i.test(location || ""),
        postedAt: null,
      });
    }
  }

  return jobs;
}

async function scanPortal(portal: typeof schema.companyPortals.$inferSelect): Promise<{ count: number; error?: string }> {
  try {
    let results: ScanResult[];

    switch (portal.scanMethod) {
      case "greenhouse":
        results = await scanGreenhouse(portal);
        break;
      case "lever":
        results = await scanLever(portal);
        break;
      case "firecrawl":
        results = await scanFirecrawl(portal);
        break;
      default:
        return { count: 0, error: `Unknown scan method: ${portal.scanMethod}` };
    }

    // Apply title filters if configured
    const titleFilters: string[] = JSON.parse(portal.titleFilters || "[]");
    const titleExclusions: string[] = JSON.parse(portal.titleExclusions || "[]");

    if (titleFilters.length > 0) {
      results = results.filter((job) =>
        titleFilters.some((f) => job.title.toLowerCase().includes(f.toLowerCase()))
      );
    }

    if (titleExclusions.length > 0) {
      results = results.filter((job) =>
        !titleExclusions.some((ex) => job.title.toLowerCase().includes(ex.toLowerCase()))
      );
    }

    // Upsert results — use dedupeKey to avoid duplicates
    for (const job of results) {
      const dedupeKey = `${portal.id}-${job.externalId}`;

      const existing = db
        .select()
        .from(schema.portalScanResults)
        .where(eq(schema.portalScanResults.dedupeKey, dedupeKey))
        .get();

      if (!existing) {
        db.insert(schema.portalScanResults)
          .values({
            portalId: portal.id,
            externalId: job.externalId,
            title: job.title,
            department: job.department,
            location: job.location,
            applyUrl: job.applyUrl,
            description: job.description,
            isRemote: job.isRemote,
            postedAt: job.postedAt,
            dedupeKey,
          })
          .run();
      }
    }

    // Update portal metadata
    db.update(schema.companyPortals)
      .set({
        lastScannedAt: new Date().toISOString(),
        lastScanJobCount: results.length,
      })
      .where(eq(schema.companyPortals.id, portal.id))
      .run();

    return { count: results.length };
  } catch (error) {
    console.error(`Scan error for ${portal.companyName}:`, error);
    return { count: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id } = body;

    if (id) {
      // Scan a specific portal
      const portal = db
        .select()
        .from(schema.companyPortals)
        .where(eq(schema.companyPortals.id, id))
        .get();

      if (!portal) {
        return NextResponse.json({ error: "Portal not found" }, { status: 404 });
      }

      const result = await scanPortal(portal);
      return NextResponse.json({ portal: portal.companyName, ...result });
    }

    // Scan all enabled portals
    const portals = db
      .select()
      .from(schema.companyPortals)
      .where(eq(schema.companyPortals.enabled, true))
      .all();

    const results = [];
    for (const portal of portals) {
      const result = await scanPortal(portal);
      results.push({ portal: portal.companyName, ...result });
    }

    const totalJobs = results.reduce((sum, r) => sum + r.count, 0);
    return NextResponse.json({ scanned: portals.length, totalJobs, results });
  } catch (error) {
    console.error("Portal scan error:", error);
    return NextResponse.json({ error: "Failed to scan portals" }, { status: 500 });
  }
}

// GET: Fetch scan results (optionally filtered by portalId)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId");
    const showDismissed = searchParams.get("showDismissed") === "true";

    let query = db
      .select({
        result: schema.portalScanResults,
        portal: schema.companyPortals,
      })
      .from(schema.portalScanResults)
      .innerJoin(schema.companyPortals, eq(schema.portalScanResults.portalId, schema.companyPortals.id))
      .orderBy(desc(schema.portalScanResults.createdAt));

    let results;
    if (portalId) {
      results = query
        .where(eq(schema.portalScanResults.portalId, Number(portalId)))
        .all();
    } else {
      results = query.all();
    }

    // Filter dismissed unless requested
    if (!showDismissed) {
      results = results.filter((r) => !r.result.dismissed);
    }

    return NextResponse.json(
      results.map((r) => ({
        ...r.result,
        companyName: r.portal.companyName,
        companyCategory: r.portal.category,
        scanMethod: r.portal.scanMethod,
      }))
    );
  } catch (error) {
    console.error("Get scan results error:", error);
    return NextResponse.json({ error: "Failed to get scan results" }, { status: 500 });
  }
}

// PATCH: Dismiss a scan result
export async function PATCH(request: NextRequest) {
  try {
    const { id, dismissed } = await request.json();

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    db.update(schema.portalScanResults)
      .set({ dismissed: dismissed !== false })
      .where(eq(schema.portalScanResults.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dismiss scan result error:", error);
    return NextResponse.json({ error: "Failed to dismiss result" }, { status: 500 });
  }
}
