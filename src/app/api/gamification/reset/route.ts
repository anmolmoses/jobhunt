import { NextResponse } from "next/server";
import { resetGamification } from "@/lib/gamification";

export async function POST() {
  try {
    resetGamification();
    return NextResponse.json({ success: true, message: "Gamification data reset" });
  } catch (error) {
    console.error("Reset gamification error:", error);
    return NextResponse.json({ error: "Failed to reset gamification data" }, { status: 500 });
  }
}
