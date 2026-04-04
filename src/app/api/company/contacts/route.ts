import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, like } from "drizzle-orm";
import { searchAndWait, isConfigured, type PersonResult } from "@/lib/happenstance/client";
import { getSetting } from "@/lib/settings";
import { companiesMatch } from "@/lib/company/match";

function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Cross-reference a person name against LinkedIn imports to find their profile URL and email.
 * Uses fuzzy company matching to handle "HARMAN India" vs "HARMAN International" etc.
 */
function enrichFromLinkedin(
  personName: string,
  companyName: string,
  linkedinConnections: { fullName: string; profileUrl: string | null; email: string | null; company: string | null }[]
): { linkedinUrl: string | null; email: string | null } {
  const normalizedPersonName = normalizeName(personName);

  // First try: match by name AND fuzzy company (most reliable)
  for (const conn of linkedinConnections) {
    if (
      conn.company &&
      companiesMatch(conn.company, companyName) &&
      normalizeName(conn.fullName) === normalizedPersonName
    ) {
      return { linkedinUrl: conn.profileUrl, email: conn.email };
    }
  }

  // Second try: match by name only (person may have changed companies on LinkedIn)
  for (const conn of linkedinConnections) {
    if (normalizeName(conn.fullName) === normalizedPersonName) {
      return { linkedinUrl: conn.profileUrl, email: conn.email };
    }
  }

  return { linkedinUrl: null, email: null };
}

export async function POST(request: NextRequest) {
  try {
    const { companyName, jobTitle } = await request.json();

    if (!companyName) {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    // Check if Happenstance is enabled
    const happenstanceEnabled = await getSetting("happenstance_enabled");
    if (happenstanceEnabled === "false") {
      return NextResponse.json(
        { error: "Happenstance is disabled. Enable it in Settings." },
        { status: 400 }
      );
    }

    if (!(await isConfigured())) {
      return NextResponse.json(
        { error: "Happenstance API key not configured. Add it in Settings." },
        { status: 400 }
      );
    }

    const normalized = normalizeCompany(companyName);

    // Load LinkedIn connections for cross-referencing
    const linkedinImports = db.select().from(schema.linkedinImports).all();
    let linkedinConnections: { fullName: string; profileUrl: string | null; email: string | null; company: string | null }[] = [];
    if (linkedinImports.length > 0) {
      const latestImport = linkedinImports[linkedinImports.length - 1];
      linkedinConnections = db
        .select({
          fullName: schema.linkedinConnections.fullName,
          profileUrl: schema.linkedinConnections.profileUrl,
          email: schema.linkedinConnections.email,
          company: schema.linkedinConnections.company,
        })
        .from(schema.linkedinConnections)
        .where(eq(schema.linkedinConnections.importId, latestImport.id))
        .all();
    }

    // Check cache first (contacts found in last 7 days)
    const cached = db
      .select()
      .from(schema.networkContacts)
      .where(eq(schema.networkContacts.normalizedCompany, normalized))
      .all();

    if (cached.length > 0) {
      // Check if cache is fresh (< 7 days)
      const oldest = cached[0];
      const ageMs = Date.now() - new Date(oldest.createdAt).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        // Even for cached results, try to enrich missing LinkedIn URLs
        const enrichedCached = cached.map((c) => {
          if (!c.personLinkedin || !c.personEmail) {
            const enriched = enrichFromLinkedin(c.personName, companyName, linkedinConnections);
            const needsUpdate = (!c.personLinkedin && enriched.linkedinUrl) || (!c.personEmail && enriched.email);
            if (needsUpdate) {
              const updates: Record<string, string> = {};
              if (!c.personLinkedin && enriched.linkedinUrl) updates.personLinkedin = enriched.linkedinUrl;
              if (!c.personEmail && enriched.email) updates.personEmail = enriched.email;
              db.update(schema.networkContacts)
                .set(updates)
                .where(eq(schema.networkContacts.id, c.id))
                .run();
              return { ...c, ...updates };
            }
          }
          return c;
        });

        return NextResponse.json({
          contacts: enrichedCached,
          cached: true,
          searchId: oldest.happenstanceSearchId,
        });
      }
    }

    // Search Happenstance
    const query = jobTitle
      ? `people who work at ${companyName} in ${jobTitle} related roles`
      : `people who work at ${companyName}`;

    const searchResult = await searchAndWait(query);

    if (searchResult.status === "failed") {
      return NextResponse.json({ error: "Search failed", contacts: [] });
    }

    // Parse and store results
    const contacts = [];
    const results = searchResult.results || [];

    // Clear old cached results for this company
    if (cached.length > 0) {
      db.delete(schema.networkContacts)
        .where(eq(schema.networkContacts.normalizedCompany, normalized))
        .run();
    }

    for (const person of results) {
      // Cross-reference with LinkedIn data to fill missing URLs
      let linkedinUrl = person.linkedin_url || null;
      let email = person.email || null;

      if ((!linkedinUrl || !email) && person.name) {
        const enriched = enrichFromLinkedin(person.name, companyName, linkedinConnections);
        if (!linkedinUrl && enriched.linkedinUrl) linkedinUrl = enriched.linkedinUrl;
        if (!email && enriched.email) email = enriched.email;
      }

      const contact = db
        .insert(schema.networkContacts)
        .values({
          companyName,
          normalizedCompany: normalized,
          personName: person.name || "Unknown",
          personTitle: person.title || null,
          personLinkedin: linkedinUrl,
          personEmail: email,
          personLocation: person.location || null,
          personBio: person.bio || null,
          personImageUrl: person.image_url || null,
          connectionType: person.connection_type || inferConnectionType(person),
          mutualConnections: JSON.stringify(person.mutual_connections || []),
          introducerName: person.introducer || null,
          happenstanceSearchId: searchResult.id,
          rawData: JSON.stringify(person),
        })
        .returning()
        .get();

      contacts.push(contact);
    }

    return NextResponse.json({
      contacts,
      cached: false,
      searchId: searchResult.id,
      totalFound: results.length,
    });
  } catch (error) {
    console.error("Contact search error:", error);
    const message = error instanceof Error ? error.message : "Failed to find contacts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function inferConnectionType(person: PersonResult): string {
  if (person.mutual_connections && person.mutual_connections.length > 0) {
    return "second_degree";
  }
  if (person.introducer) {
    return "second_degree";
  }
  return "direct";
}
