import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getGoogleSheetsClient } from "@/lib/sheets/client";

export async function POST() {
  try {
    const sheetId = await getSetting("google_sheet_id");
    const credentialsJson = await getSetting("google_service_account_json");

    if (!sheetId || !credentialsJson) {
      return NextResponse.json(
        { success: false, error: "Sheet ID and service account credentials are required" },
        { status: 400 },
      );
    }

    const sheets = getGoogleSheetsClient(credentialsJson);
    const response = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const title = response.data.properties?.title || "Unknown";

    return NextResponse.json({ success: true, title });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
