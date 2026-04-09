import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getSetting } from "@/lib/settings";
import { getGoogleSheetsClient } from "./client";

export interface TrackerJob {
  title: string;
  company: string;
  location: string | null;
  status: string;
  appliedAt: string | null;
  followUpDate: string | null;
  nextStep: string | null;
  notes: string | null;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  provider: string;
  tags: string;
  applyUrl: string | null;
  isRemote: boolean;
  jobType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerInterview {
  company: string;
  jobTitle: string;
  type: string;
  scheduledAt: string | null;
  duration: number | null;
  interviewerName: string | null;
  interviewerTitle: string | null;
  meetingLink: string | null;
  outcome: string | null;
  notes: string | null;
  feedback: string | null;
}

export function getTrackerData(): { jobs: TrackerJob[]; interviews: TrackerInterview[] } {
  const savedJobs = db
    .select()
    .from(schema.savedJobs)
    .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
    .orderBy(desc(schema.savedJobs.updatedAt))
    .all();

  const jobs: TrackerJob[] = savedJobs.map((row) => ({
    title: row.job_results.title,
    company: row.job_results.company,
    location: row.job_results.location,
    status: row.saved_jobs.status,
    appliedAt: row.saved_jobs.appliedAt,
    followUpDate: row.saved_jobs.followUpDate,
    nextStep: row.saved_jobs.nextStep,
    notes: row.saved_jobs.notes,
    salary: row.job_results.salary,
    salaryMin: row.job_results.salaryMin,
    salaryMax: row.job_results.salaryMax,
    provider: row.job_results.provider,
    tags: row.job_results.tags || "[]",
    applyUrl: row.job_results.applyUrl,
    isRemote: row.job_results.isRemote,
    jobType: row.job_results.jobType,
    createdAt: row.saved_jobs.createdAt,
    updatedAt: row.saved_jobs.updatedAt,
  }));

  // Get interviews with parent job info
  const allInterviews = db
    .select()
    .from(schema.interviews)
    .innerJoin(schema.savedJobs, eq(schema.interviews.savedJobId, schema.savedJobs.id))
    .innerJoin(schema.jobResults, eq(schema.savedJobs.jobResultId, schema.jobResults.id))
    .orderBy(desc(schema.interviews.scheduledAt))
    .all();

  const interviews: TrackerInterview[] = allInterviews.map((row) => ({
    company: row.job_results.company,
    jobTitle: row.job_results.title,
    type: row.interviews.type,
    scheduledAt: row.interviews.scheduledAt,
    duration: row.interviews.duration,
    interviewerName: row.interviews.interviewerName,
    interviewerTitle: row.interviews.interviewerTitle,
    meetingLink: row.interviews.meetingLink,
    outcome: row.interviews.outcome,
    notes: row.interviews.notes,
    feedback: row.interviews.feedback,
  }));

  return { jobs, interviews };
}

const JOB_HEADERS = [
  "Title", "Company", "Location", "Status", "Applied At", "Follow-Up Date",
  "Next Step", "Notes", "Salary", "Salary Min", "Salary Max", "Provider",
  "Tags", "Apply URL", "Remote", "Job Type", "Tracked At", "Updated At",
];

const INTERVIEW_HEADERS = [
  "Company", "Job Title", "Type", "Scheduled At", "Duration (min)",
  "Interviewer", "Interviewer Title", "Meeting Link", "Outcome", "Notes", "Feedback",
];

export function jobToRow(job: TrackerJob): (string | number | boolean | null)[] {
  return [
    job.title, job.company, job.location, job.status, job.appliedAt,
    job.followUpDate, job.nextStep, job.notes, job.salary, job.salaryMin,
    job.salaryMax, job.provider, job.tags, job.applyUrl, job.isRemote ? "Yes" : "No",
    job.jobType, job.createdAt, job.updatedAt,
  ];
}

export function interviewToRow(interview: TrackerInterview): (string | number | boolean | null)[] {
  return [
    interview.company, interview.jobTitle, interview.type, interview.scheduledAt,
    interview.duration, interview.interviewerName, interview.interviewerTitle,
    interview.meetingLink, interview.outcome, interview.notes, interview.feedback,
  ];
}

async function ensureSheet(
  sheets: ReturnType<typeof getGoogleSheetsClient>,
  spreadsheetId: string,
  sheetTitle: string,
) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets?.some((s) => s.properties?.title === sheetTitle);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTitle } } }],
      },
    });
  }
}

function setSetting(key: string, value: string) {
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (existing) {
    db.update(schema.settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key, value, isEncrypted: false })
      .run();
  }
}

export async function syncToGoogleSheets(): Promise<void> {
  const enabled = await getSetting("google_sheets_enabled");
  if (enabled !== "true") return;

  const sheetId = await getSetting("google_sheet_id");
  const credentialsJson = await getSetting("google_service_account_json");
  if (!sheetId || !credentialsJson) return;

  const sheets = getGoogleSheetsClient(credentialsJson);
  const data = getTrackerData();

  // Ensure sheets exist
  await ensureSheet(sheets, sheetId, "Jobs");
  await ensureSheet(sheets, sheetId, "Interviews");

  // Write Jobs sheet
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: "Jobs!A:Z",
  });
  if (data.jobs.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Jobs!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [JOB_HEADERS, ...data.jobs.map(jobToRow)],
      },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Jobs!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [JOB_HEADERS] },
    });
  }

  // Write Interviews sheet
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: "Interviews!A:Z",
  });
  if (data.interviews.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Interviews!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [INTERVIEW_HEADERS, ...data.interviews.map(interviewToRow)],
      },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Interviews!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [INTERVIEW_HEADERS] },
    });
  }

  setSetting("google_sheets_last_sync", new Date().toISOString());
  setSetting("google_sheets_last_error", "");
}

export function triggerGoogleSheetsSync(): void {
  syncToGoogleSheets().catch((err) => {
    console.error("[Google Sheets sync error]", err);
    try {
      setSetting("google_sheets_last_error", String(err?.message || err));
    } catch { /* ignore */ }
  });
}
