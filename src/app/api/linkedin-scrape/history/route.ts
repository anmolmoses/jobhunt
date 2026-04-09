import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const runs = db
    .select()
    .from(schema.linkedinScrapeRuns)
    .orderBy(desc(schema.linkedinScrapeRuns.startedAt))
    .limit(20)
    .all();

  return NextResponse.json({ runs });
}
