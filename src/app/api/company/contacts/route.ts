import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { searchAndWait, isConfigured, type PersonResult } from "@/lib/happenstance/client";

function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const { companyName, jobTitle } = await request.json();

    if (!companyName) {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    if (!(await isConfigured())) {
      return NextResponse.json(
        { error: "Happenstance API key not configured. Add it in Settings." },
        { status: 400 }
      );
    }

    const normalized = normalizeCompany(companyName);

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
        return NextResponse.json({
          contacts: cached,
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
      const contact = db
        .insert(schema.networkContacts)
        .values({
          companyName,
          normalizedCompany: normalized,
          personName: person.name || "Unknown",
          personTitle: person.title || null,
          personLinkedin: person.linkedin_url || null,
          personEmail: person.email || null,
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
