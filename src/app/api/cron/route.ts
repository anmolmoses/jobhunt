import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getCronStatus, updateCronSchedule } from "@/lib/cron/service";
import cron from "node-cron";

export async function GET() {
  try {
    const status = getCronStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get cron status" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { schedule, enabled, datePosted, resultsPerPage } = body;

    if (schedule !== undefined) {
      if (!cron.validate(schedule)) {
        return NextResponse.json(
          { error: `Invalid cron expression: ${schedule}` },
          { status: 400 }
        );
      }
    }

    // Get or create config
    let config = db.select().from(schema.cronConfig).limit(1).get();
    if (!config) {
      config = db
        .insert(schema.cronConfig)
        .values({ enabled: false, schedule: "0 9 * * *" })
        .returning()
        .get();
    }

    // Update non-schedule fields directly
    if (datePosted !== undefined || resultsPerPage !== undefined) {
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (datePosted !== undefined) updates.datePosted = datePosted;
      if (resultsPerPage !== undefined) updates.resultsPerPage = resultsPerPage;
      db.update(schema.cronConfig)
        .set(updates)
        .where(eq(schema.cronConfig.id, config.id))
        .run();
    }

    // Update schedule + enabled (restarts the cron task)
    const newSchedule = schedule ?? config.schedule;
    const newEnabled = enabled ?? config.enabled;
    updateCronSchedule(newSchedule, newEnabled);

    const status = getCronStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update cron config" },
      { status: 500 }
    );
  }
}
