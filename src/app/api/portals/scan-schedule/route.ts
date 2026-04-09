import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// GET: Get current scan schedule config
export async function GET() {
  try {
    let config = db
      .select()
      .from(schema.portalScanConfig)
      .limit(1)
      .get();

    if (!config) {
      // Create default config
      db.insert(schema.portalScanConfig)
        .values({
          enabled: false,
          schedule: "0 8 * * *",
          scanBatchSize: 20,
          notifyOnNewJobs: true,
        })
        .run();

      config = db
        .select()
        .from(schema.portalScanConfig)
        .limit(1)
        .get();
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Get scan schedule error:", error);
    return NextResponse.json({ error: "Failed to get scan schedule" }, { status: 500 });
  }
}

// PATCH: Update scan schedule config
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { enabled, schedule, scanBatchSize, notifyOnNewJobs } = body;

    let config = db
      .select()
      .from(schema.portalScanConfig)
      .limit(1)
      .get();

    if (!config) {
      db.insert(schema.portalScanConfig)
        .values({
          enabled: enabled ?? false,
          schedule: schedule ?? "0 8 * * *",
          scanBatchSize: scanBatchSize ?? 20,
          notifyOnNewJobs: notifyOnNewJobs ?? true,
        })
        .run();
    } else {
      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (enabled !== undefined) updates.enabled = enabled;
      if (schedule !== undefined) updates.schedule = schedule;
      if (scanBatchSize !== undefined) updates.scanBatchSize = scanBatchSize;
      if (notifyOnNewJobs !== undefined) updates.notifyOnNewJobs = notifyOnNewJobs;

      db.update(schema.portalScanConfig)
        .set(updates)
        .where(eq(schema.portalScanConfig.id, config.id))
        .run();
    }

    const updated = db
      .select()
      .from(schema.portalScanConfig)
      .limit(1)
      .get();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update scan schedule error:", error);
    return NextResponse.json({ error: "Failed to update scan schedule" }, { status: 500 });
  }
}
