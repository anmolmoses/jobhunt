import { NextRequest, NextResponse } from "next/server";
import { getDailyHistory } from "@/lib/gamification";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "180", 10);
    const history = getDailyHistory(Math.min(days, 365));
    return NextResponse.json(history);
  } catch (error) {
    console.error("Get gamification history error:", error);
    return NextResponse.json({ error: "Failed to get gamification history" }, { status: 500 });
  }
}
