import { NextResponse } from "next/server";
import { startScrape, isRunning } from "@/lib/jobs/linkedin-auth";

export async function POST() {
  try {
    if (isRunning()) {
      return NextResponse.json(
        { error: "A scrape is already running" },
        { status: 409 }
      );
    }

    const { runId } = await startScrape();
    return NextResponse.json({ runId, status: "started" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start scrape";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
