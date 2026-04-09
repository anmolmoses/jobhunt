import { NextResponse } from "next/server";
import { syncToGoogleSheets } from "@/lib/sheets/sync";

export async function POST() {
  try {
    await syncToGoogleSheets();
    return NextResponse.json({ success: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
