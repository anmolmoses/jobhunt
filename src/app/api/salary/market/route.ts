import { NextRequest, NextResponse } from "next/server";
import { scrapeSalaryIntelligence } from "@/lib/salary/scraper";

// POST — scrape market salary data for a role
export async function POST(request: NextRequest) {
  try {
    const { jobTitle, location, company, experience } = await request.json();

    if (!jobTitle) {
      return NextResponse.json({ error: "jobTitle is required" }, { status: 400 });
    }

    const result = await scrapeSalaryIntelligence(jobTitle, location, company, experience);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Salary market POST error:", error);
    return NextResponse.json({ error: "Failed to fetch market salary data" }, { status: 500 });
  }
}
