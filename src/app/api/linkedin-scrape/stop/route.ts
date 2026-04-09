import { NextResponse } from "next/server";
import { stopScrape, isRunning } from "@/lib/jobs/linkedin-auth";

export async function POST() {
  if (!isRunning()) {
    return NextResponse.json({ error: "No scrape is running" }, { status: 404 });
  }

  stopScrape();
  return NextResponse.json({ status: "stopping" });
}
