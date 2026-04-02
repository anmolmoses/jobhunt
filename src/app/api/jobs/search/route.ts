import { NextRequest, NextResponse } from "next/server";
import { searchJobs } from "@/lib/jobs/orchestrator";
import type { JobSearchParams } from "@/types/jobs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const params: JobSearchParams = {
      query: body.query || "",
      location: body.location,
      remote: body.remote,
      datePosted: body.datePosted,
      salaryMin: body.salaryMin,
      employmentType: body.employmentType,
      page: body.page || 1,
      resultsPerPage: body.resultsPerPage || 20,
    };

    if (!params.query.trim()) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 });
    }

    const result = await searchJobs(params, body.providers);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
