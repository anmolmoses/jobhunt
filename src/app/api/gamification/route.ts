import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getStats, getOrCreateProfile } from "@/lib/gamification";

export async function GET() {
  try {
    const stats = getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Get gamification stats error:", error);
    return NextResponse.json({ error: "Failed to get gamification stats" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const profile = getOrCreateProfile();

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.dailyGoals) updates.dailyGoals = JSON.stringify(body.dailyGoals);
    if (body.streakConfig) updates.streakConfig = JSON.stringify(body.streakConfig);

    db.update(schema.gamificationProfile)
      .set(updates)
      .where(eq(schema.gamificationProfile.id, profile.id))
      .run();

    const stats = getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Update gamification settings error:", error);
    return NextResponse.json({ error: "Failed to update gamification settings" }, { status: 500 });
  }
}
