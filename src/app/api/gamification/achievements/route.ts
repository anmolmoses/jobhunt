import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ACHIEVEMENTS } from "@/lib/gamification";

export async function GET() {
  try {
    const unlocked = db.select().from(schema.gamificationAchievements).all();
    const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u]));

    const achievements = ACHIEVEMENTS.map((a) => {
      const unlock = unlockedMap.get(a.id);
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        category: a.category,
        xpReward: a.xpReward,
        icon: a.icon,
        unlocked: !!unlock,
        unlockedAt: unlock?.unlockedAt ?? null,
        notified: unlock?.notified ?? false,
      };
    });

    // Mark newly seen achievements as notified
    const unnotified = unlocked.filter((u) => !u.notified);
    for (const u of unnotified) {
      db.update(schema.gamificationAchievements)
        .set({ notified: true })
        .where(eq(schema.gamificationAchievements.id, u.id))
        .run();
    }

    return NextResponse.json(achievements);
  } catch (error) {
    console.error("Get achievements error:", error);
    return NextResponse.json({ error: "Failed to get achievements" }, { status: 500 });
  }
}
