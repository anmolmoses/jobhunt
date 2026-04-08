import { NextRequest, NextResponse } from "next/server";
import { enrichCompany } from "@/lib/company/enrichment";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { companyName, jobTitle, location, jobDescription, bustCache } = await request.json();

    if (!companyName || !jobTitle) {
      return NextResponse.json(
        { error: "companyName and jobTitle are required" },
        { status: 400 }
      );
    }

    // Clear cached entry if retry requested
    if (bustCache) {
      const normalized = companyName.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
      db.delete(schema.companyEnrichment)
        .where(eq(schema.companyEnrichment.normalizedName, normalized))
        .run();
    }

    const data = await enrichCompany(companyName, jobTitle, location, jobDescription);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Company enrichment error:", error);
    return NextResponse.json(
      { error: "Failed to enrich company data" },
      { status: 500 }
    );
  }
}
