import ExcelJS from "exceljs";
import { getTrackerData, jobToRow, interviewToRow } from "./sync";

const JOB_HEADERS = [
  "Title", "Company", "Location", "Status", "Applied At", "Follow-Up Date",
  "Next Step", "Notes", "Salary", "Salary Min", "Salary Max", "Provider",
  "Tags", "Apply URL", "Remote", "Job Type", "Tracked At", "Updated At",
];

const INTERVIEW_HEADERS = [
  "Company", "Job Title", "Type", "Scheduled At", "Duration (min)",
  "Interviewer", "Interviewer Title", "Meeting Link", "Outcome", "Notes", "Feedback",
];

export async function buildExcelWorkbook(): Promise<ExcelJS.Workbook> {
  const data = getTrackerData();
  const workbook = new ExcelJS.Workbook();

  // Jobs sheet
  const jobsSheet = workbook.addWorksheet("Jobs");
  jobsSheet.addRow(JOB_HEADERS);
  for (const job of data.jobs) {
    jobsSheet.addRow(jobToRow(job).map((v) => v ?? ""));
  }
  // Style header row
  jobsSheet.getRow(1).font = { bold: true };
  jobsSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  // Auto-width columns
  jobsSheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = Math.min(len, 50);
    });
    col.width = maxLen + 2;
  });
  jobsSheet.views = [{ state: "frozen", ySplit: 1 }];

  // Interviews sheet
  const interviewsSheet = workbook.addWorksheet("Interviews");
  interviewsSheet.addRow(INTERVIEW_HEADERS);
  for (const interview of data.interviews) {
    interviewsSheet.addRow(interviewToRow(interview).map((v) => v ?? ""));
  }
  interviewsSheet.getRow(1).font = { bold: true };
  interviewsSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  interviewsSheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = Math.min(len, 50);
    });
    col.width = maxLen + 2;
  });
  interviewsSheet.views = [{ state: "frozen", ySplit: 1 }];

  return workbook;
}
