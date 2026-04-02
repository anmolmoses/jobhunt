import { NextRequest, NextResponse } from "next/server";
import { enrichCompany } from "@/lib/company/enrichment";

export async function POST(request: NextRequest) {
  try {
    const { companyName, jobTitle, location, jobDescription } = await request.json();

    if (!companyName || !jobTitle) {
      return NextResponse.json(
        { error: "companyName and jobTitle are required" },
        { status: 400 }
      );
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
