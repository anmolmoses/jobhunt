import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, like, sql, desc } from "drizzle-orm";
import { companiesMatch, filterByCompany } from "@/lib/company/match";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const company = searchParams.get("company") || "";
    const matchSavedJobs = searchParams.get("matchSavedJobs") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Check if we have any imports
    const imports = db.select().from(schema.linkedinImports).all();
    if (imports.length === 0) {
      return NextResponse.json({ connections: [], total: 0, companies: [], hasImport: false });
    }

    const latestImport = imports[imports.length - 1];

    // Build base query conditions
    let connections;
    let total: number;

    if (matchSavedJobs) {
      // Get all company names from saved jobs (keep originals for fuzzy matching)
      const savedJobCompanyNames = db
        .select({ company: schema.jobResults.company })
        .from(schema.savedJobs)
        .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
        .all()
        .map((r) => r.company);

      if (savedJobCompanyNames.length === 0) {
        return NextResponse.json({ connections: [], total: 0, companies: [], hasImport: true });
      }

      // Deduplicate company names
      const uniqueCompanies = [...new Set(savedJobCompanyNames)];

      // Get all connections and fuzzy-match against saved job companies
      const allConnections = db
        .select()
        .from(schema.linkedinConnections)
        .where(eq(schema.linkedinConnections.importId, latestImport.id))
        .all();

      const allMatching = allConnections.filter((c) => {
        if (!c.company) return false;
        return uniqueCompanies.some((jobCompany) => companiesMatch(c.company!, jobCompany));
      });

      total = allMatching.length;
      connections = allMatching.slice(offset, offset + limit);
    } else if (search || company) {
      // Filtered query
      const allConnections = db
        .select()
        .from(schema.linkedinConnections)
        .where(eq(schema.linkedinConnections.importId, latestImport.id))
        .all()
        .filter((c) => {
          if (search) {
            const s = search.toLowerCase();
            const matchesName = c.fullName.toLowerCase().includes(s);
            const matchesCompany = c.company?.toLowerCase().includes(s);
            const matchesPosition = c.position?.toLowerCase().includes(s);
            if (!matchesName && !matchesCompany && !matchesPosition) return false;
          }
          if (company) {
            if (!c.company) return false;
            if (!companiesMatch(c.company, company)) return false;
          }
          return true;
        });

      total = allConnections.length;
      connections = allConnections.slice(offset, offset + limit);
    } else {
      // All connections
      total = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.linkedinConnections)
        .where(eq(schema.linkedinConnections.importId, latestImport.id))
        .get()?.count || 0;

      connections = db
        .select()
        .from(schema.linkedinConnections)
        .where(eq(schema.linkedinConnections.importId, latestImport.id))
        .limit(limit)
        .offset(offset)
        .all();
    }

    // Get message data for these connections to show interaction status
    const messages = db
      .select()
      .from(schema.linkedinMessages)
      .where(eq(schema.linkedinMessages.importId, latestImport.id))
      .all();

    // Build profile URL -> message info map
    const messageMap = new Map<string, { messageCount: number; direction: string; lastDate: string | null }>();
    for (const msg of messages) {
      if (msg.participantProfileUrl) {
        messageMap.set(msg.participantProfileUrl, {
          messageCount: msg.messageCount,
          direction: msg.direction || "unknown",
          lastDate: msg.lastMessageDate,
        });
      }
    }

    // Enrich connections with message data
    const enrichedConnections = connections.map((c) => {
      const msgInfo = c.profileUrl ? messageMap.get(c.profileUrl) : null;
      return {
        ...c,
        hasMessages: !!msgInfo,
        messageCount: msgInfo?.messageCount || 0,
        messageDirection: msgInfo?.direction || null,
        lastMessageDate: msgInfo?.lastDate || null,
      };
    });

    // Get top companies for filter
    const companyCounts = db
      .select({
        company: schema.linkedinConnections.company,
        count: sql<number>`count(*)`,
      })
      .from(schema.linkedinConnections)
      .where(eq(schema.linkedinConnections.importId, latestImport.id))
      .groupBy(schema.linkedinConnections.company)
      .orderBy(desc(sql`count(*)`))
      .limit(50)
      .all()
      .filter((c) => c.company);

    return NextResponse.json({
      connections: enrichedConnections,
      total,
      companies: companyCounts,
      hasImport: true,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("LinkedIn connections error:", error);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}
