import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { companiesMatch, coreCompanyName } from "@/lib/company/match";
import { getSetting } from "@/lib/settings";
import { guessDomain } from "@/lib/company/logo";

interface GraphNode {
  id: string;
  name: string;
  type: "company" | "person";
  // Company fields
  connectionCount?: number;
  hasSavedJob?: boolean;
  logoUrl?: string;
  // Person fields
  company?: string;
  position?: string;
  profileUrl?: string;
  email?: string;
  connectedOn?: string;
  hasMessages?: boolean;
  messageCount?: number;
  initials?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

export async function GET() {
  try {
    const imports = db.select().from(schema.linkedinImports).all();
    if (imports.length === 0) {
      return NextResponse.json({ nodes: [], links: [], hasImport: false });
    }

    const latestImport = imports[imports.length - 1];

    // Get all connections
    const connections = db
      .select()
      .from(schema.linkedinConnections)
      .where(eq(schema.linkedinConnections.importId, latestImport.id))
      .all();

    // Get message data
    const messages = db
      .select()
      .from(schema.linkedinMessages)
      .where(eq(schema.linkedinMessages.importId, latestImport.id))
      .all();

    const messageMap = new Map<string, { messageCount: number }>();
    for (const msg of messages) {
      if (msg.participantProfileUrl) {
        messageMap.set(msg.participantProfileUrl, { messageCount: msg.messageCount });
      }
    }

    // Get saved job companies for highlighting
    const savedJobCompanies = db
      .select({ company: schema.jobResults.company })
      .from(schema.savedJobs)
      .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
      .all()
      .map((r) => r.company);

    // Group connections by company (using core name for grouping)
    const companyGroups = new Map<string, {
      displayName: string;
      connections: typeof connections;
    }>();

    for (const conn of connections) {
      if (!conn.company) continue;

      const core = coreCompanyName(conn.company);
      if (!core) continue;

      const existing = companyGroups.get(core);
      if (existing) {
        existing.connections.push(conn);
      } else {
        companyGroups.set(core, {
          displayName: conn.company,
          connections: [conn],
        });
      }
    }

    // Build nodes and links
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Get logo.dev token once (if configured)
    let logodevToken: string | null = null;
    try {
      logodevToken = await getSetting("logodev_api_key");
    } catch { /* no token */ }

    function getLogoUrl(companyName: string): string | null {
      const domain = guessDomain(companyName);
      if (!domain) return null;
      if (logodevToken) {
        return `https://img.logo.dev/${domain}?token=${logodevToken}&size=128&format=png&fallback=monogram`;
      }
      // Free fallback: Google favicon service (high-res)
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }

    // Only include companies with at least 1 connection (skip singletons for cleaner graph)
    // But always include companies matching saved jobs
    for (const [core, group] of companyGroups) {
      const companyId = `company-${core}`;
      const hasSavedJob = savedJobCompanies.some((sc) =>
        companiesMatch(sc, group.displayName)
      );

      // Skip companies with only 1 connection unless they match a saved job
      if (group.connections.length < 2 && !hasSavedJob) continue;

      const logoUrl = getLogoUrl(group.displayName);

      nodes.push({
        id: companyId,
        name: group.displayName,
        type: "company",
        connectionCount: group.connections.length,
        hasSavedJob,
        logoUrl: logoUrl || undefined,
      });

      for (const conn of group.connections) {
        const personId = `person-${conn.id}`;
        const msgInfo = conn.profileUrl ? messageMap.get(conn.profileUrl) : null;

        // Generate initials for people
        const initials = [conn.firstName?.[0], conn.lastName?.[0]]
          .filter(Boolean)
          .join("")
          .toUpperCase();

        nodes.push({
          id: personId,
          name: conn.fullName,
          type: "person",
          company: conn.company || undefined,
          position: conn.position || undefined,
          profileUrl: conn.profileUrl || undefined,
          email: conn.email || undefined,
          connectedOn: conn.connectedOn || undefined,
          hasMessages: !!msgInfo,
          messageCount: msgInfo?.messageCount || 0,
          initials: initials || undefined,
        });

        links.push({ source: personId, target: companyId });
      }
    }

    return NextResponse.json({
      nodes,
      links,
      hasImport: true,
      stats: {
        totalCompanies: companyGroups.size,
        visibleCompanies: nodes.filter((n) => n.type === "company").length,
        visiblePeople: nodes.filter((n) => n.type === "person").length,
        savedJobMatches: nodes.filter((n) => n.type === "company" && n.hasSavedJob).length,
      },
    });
  } catch (error) {
    console.error("LinkedIn graph error:", error);
    return NextResponse.json({ error: "Failed to build graph" }, { status: 500 });
  }
}
