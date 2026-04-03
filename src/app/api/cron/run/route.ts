import { NextResponse } from "next/server";
import { triggerManualRun } from "@/lib/cron/service";

export async function POST() {
  try {
    const result = await triggerManualRun();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trigger manual run" },
      { status: 500 }
    );
  }
}
