import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { isRunning, getTimeSinceLastRun } from "@/lib/jobs/linkedin-auth";
import { getSetting } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const afterLogId = parseInt(searchParams.get("afterLogId") || "0", 10);

  // Get the latest run if no runId specified
  const run = runId
    ? db
        .select()
        .from(schema.linkedinScrapeRuns)
        .where(eq(schema.linkedinScrapeRuns.id, parseInt(runId, 10)))
        .get()
    : db
        .select()
        .from(schema.linkedinScrapeRuns)
        .orderBy(desc(schema.linkedinScrapeRuns.startedAt))
        .limit(1)
        .get();

  // Get logs (only new ones if afterLogId is specified)
  let logs: Array<{
    id: number;
    level: string;
    message: string;
    metadata: string | null;
    createdAt: string;
  }> = [];

  if (run) {
    const allLogs = db
      .select()
      .from(schema.linkedinScrapeLogs)
      .where(eq(schema.linkedinScrapeLogs.runId, run.id))
      .all();

    logs = afterLogId
      ? allLogs.filter((l) => l.id > afterLogId)
      : allLogs;
  }

  // Check if cookie is configured
  const hasCookie = !!(await getSetting("linkedin_li_at"));

  return NextResponse.json({
    run: run || null,
    logs,
    isRunning: isRunning(),
    timeSinceLastRunMs: getTimeSinceLastRun(),
    hasCookie,
  });
}
