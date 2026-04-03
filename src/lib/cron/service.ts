import cron, { type ScheduledTask } from "node-cron";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { runAutomatedJobSearch } from "./runner";

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;

function getOrCreateConfig() {
  let config = db.select().from(schema.cronConfig).limit(1).get();
  if (!config) {
    config = db
      .insert(schema.cronConfig)
      .values({ enabled: false, schedule: "0 9 * * *" })
      .returning()
      .get();
  }
  return config;
}

function stopExistingTask() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

async function executeJob() {
  if (isRunning) {
    console.log("[cron] Job already running, skipping");
    return;
  }

  isRunning = true;
  const config = getOrCreateConfig();

  // Mark as running
  db.update(schema.cronConfig)
    .set({
      lastRunStatus: "running",
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.cronConfig.id, config.id))
    .run();

  console.log("[cron] Starting automated job search...");

  try {
    const result = await runAutomatedJobSearch();

    // Update config with results
    db.update(schema.cronConfig)
      .set({
        lastRunStatus: result.status,
        lastRunMessage: result.message,
        lastRunJobsFound: result.jobsFound,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.cronConfig.id, config.id))
      .run();

    // Log to history
    db.insert(schema.cronRunHistory)
      .values({
        status: result.status,
        jobsFound: result.jobsFound,
        queriesRun: result.queriesRun,
        providersUsed: JSON.stringify(result.providersUsed),
        message: result.message,
        durationMs: result.durationMs,
      })
      .run();

    console.log(`[cron] Completed: ${result.message} (${result.durationMs}ms)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    db.update(schema.cronConfig)
      .set({
        lastRunStatus: "failed",
        lastRunMessage: message,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.cronConfig.id, config.id))
      .run();

    db.insert(schema.cronRunHistory)
      .values({
        status: "failed",
        jobsFound: 0,
        queriesRun: 0,
        providersUsed: "[]",
        message,
      })
      .run();

    console.error("[cron] Failed:", message);
  } finally {
    isRunning = false;
  }
}

/**
 * Initialize the cron scheduler from DB config.
 * Called on server startup.
 */
export function initCron() {
  const config = getOrCreateConfig();

  if (config.enabled && cron.validate(config.schedule)) {
    stopExistingTask();
    scheduledTask = cron.schedule(config.schedule, () => {
      executeJob();
    });
    console.log(`[cron] Scheduled automated job search: ${config.schedule}`);
  } else {
    console.log("[cron] Automated job search is disabled");
  }
}

/**
 * Update the cron schedule and restart if needed.
 */
export function updateCronSchedule(schedule: string, enabled: boolean) {
  const config = getOrCreateConfig();

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron expression: ${schedule}`);
  }

  db.update(schema.cronConfig)
    .set({
      schedule,
      enabled,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.cronConfig.id, config.id))
    .run();

  stopExistingTask();

  if (enabled) {
    scheduledTask = cron.schedule(schedule, () => {
      executeJob();
    });
    console.log(`[cron] Rescheduled: ${schedule}`);
  } else {
    console.log("[cron] Disabled automated job search");
  }
}

/**
 * Trigger an immediate run (manual).
 */
export async function triggerManualRun() {
  if (isRunning) {
    return { error: "A search is already running" };
  }
  await executeJob();
  const config = getOrCreateConfig();
  return {
    status: config.lastRunStatus,
    message: config.lastRunMessage,
    jobsFound: config.lastRunJobsFound,
  };
}

/**
 * Get current cron status.
 */
export function getCronStatus() {
  const config = getOrCreateConfig();
  return {
    enabled: config.enabled,
    schedule: config.schedule,
    datePosted: config.datePosted,
    resultsPerPage: config.resultsPerPage,
    lastRunAt: config.lastRunAt,
    lastRunStatus: config.lastRunStatus,
    lastRunMessage: config.lastRunMessage,
    lastRunJobsFound: config.lastRunJobsFound,
    isRunning,
  };
}
