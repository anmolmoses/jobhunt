import { db, schema } from "@/db";
import { eq, desc, sql, gte } from "drizzle-orm";
import type { ActionType, GamificationResult, GamificationStats, DailyGoals, StreakConfig, AchievementContext } from "./types";
import { XP_VALUES, DAILY_GOAL_BONUS_XP, calculateLevel, getStreakMultiplier, xpForCurrentLevel, xpForNextLevel, xpProgressPercent, actionDescription } from "./xp";
import { updateStreak, actionCountsTowardStreak } from "./streaks";
import { checkDailyGoals } from "./daily-goals";
import { ACHIEVEMENTS, checkAndUnlockAchievements } from "./achievements";

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function getOrCreateProfile() {
  let profile = db.select().from(schema.gamificationProfile).get();
  if (!profile) {
    profile = db.insert(schema.gamificationProfile).values({}).returning().get();
  }
  return profile;
}

function getOrCreateDailyLog(date: string) {
  let log = db.select().from(schema.gamificationDailyLog).where(eq(schema.gamificationDailyLog.date, date)).get();
  if (!log) {
    log = db.insert(schema.gamificationDailyLog).values({ date }).returning().get();
  }
  return log;
}

// Map action types to daily log column names
const ACTION_TO_COLUMN: Record<ActionType, string> = {
  apply: "applications",
  search: "searches",
  save_job: "jobsSaved",
  outreach: "outreach",
  interview: "interviews",
  resume_upload: "resumeUploads",
  resume_analyze: "resumeAnalyses",
  resume_tailor: "resumeTailors",
  autopilot: "searches", // autopilot counts as a search
};

function getAllTimeCounts(): Record<string, number> {
  const row = db
    .select({
      applications: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.applications}), 0)`,
      searches: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.searches}), 0)`,
      outreach: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.outreach}), 0)`,
      interviews: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.interviews}), 0)`,
      resumeUploads: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.resumeUploads}), 0)`,
      resumeAnalyses: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.resumeAnalyses}), 0)`,
      resumeTailors: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.resumeTailors}), 0)`,
      jobsSaved: sql<number>`COALESCE(SUM(${schema.gamificationDailyLog.jobsSaved}), 0)`,
    })
    .from(schema.gamificationDailyLog)
    .get();

  return {
    applications: Number(row?.applications ?? 0),
    searches: Number(row?.searches ?? 0),
    outreach: Number(row?.outreach ?? 0),
    interviews: Number(row?.interviews ?? 0),
    resumeUploads: Number(row?.resumeUploads ?? 0),
    resumeAnalyses: Number(row?.resumeAnalyses ?? 0),
    resumeTailors: Number(row?.resumeTailors ?? 0),
    jobsSaved: Number(row?.jobsSaved ?? 0),
  };
}

function getWeekendActiveDays(today: string): number {
  const todayDate = new Date(today + "T00:00:00");
  const dayOfWeek = todayDate.getDay(); // 0=Sun, 6=Sat

  // Find the Saturday and Sunday of the current weekend
  let saturday: string;
  let sunday: string;

  if (dayOfWeek === 0) {
    // Today is Sunday
    const sat = new Date(todayDate);
    sat.setDate(sat.getDate() - 1);
    saturday = sat.toISOString().split("T")[0];
    sunday = today;
  } else if (dayOfWeek === 6) {
    // Today is Saturday
    saturday = today;
    const sun = new Date(todayDate);
    sun.setDate(sun.getDate() + 1);
    sunday = sun.toISOString().split("T")[0];
  } else {
    // Weekday — check last weekend
    const sat = new Date(todayDate);
    sat.setDate(sat.getDate() - dayOfWeek - 1);
    saturday = sat.toISOString().split("T")[0];
    const sun = new Date(sat);
    sun.setDate(sun.getDate() + 1);
    sunday = sun.toISOString().split("T")[0];
  }

  let count = 0;
  const satLog = db.select().from(schema.gamificationDailyLog).where(eq(schema.gamificationDailyLog.date, saturday)).get();
  if (satLog && satLog.totalActions > 0) count++;
  const sunLog = db.select().from(schema.gamificationDailyLog).where(eq(schema.gamificationDailyLog.date, sunday)).get();
  if (sunLog && sunLog.totalActions > 0) count++;

  return count;
}

export function recordAction(
  actionType: ActionType,
  metadata?: Record<string, unknown>
): GamificationResult {
  const profile = getOrCreateProfile();

  // No-op if gamification is disabled
  if (!profile.enabled) {
    return {
      xpAwarded: 0,
      multiplier: 1,
      newTotalXp: profile.totalXp,
      newLevel: profile.level,
      leveledUp: false,
      previousLevel: profile.level,
      streakUpdated: false,
      currentStreak: profile.currentStreak,
      achievementsUnlocked: [],
      dailyGoalsMet: false,
    };
  }

  const today = getToday();
  const streakConfig: StreakConfig = JSON.parse(profile.streakConfig);
  const parsedGoals = JSON.parse(profile.dailyGoals);
  const dailyGoals: DailyGoals = { applications: 0, searches: 0, outreach: 0, jobsSaved: 0, ...parsedGoals };
  const previousLevel = profile.level;

  // 1. Update streak
  let streakUpdated = false;
  let currentStreak = profile.currentStreak;
  let longestStreak = profile.longestStreak;
  let streakProtectionUsed = profile.streakProtectionUsed;

  if (actionCountsTowardStreak(actionType, streakConfig)) {
    const streakResult = updateStreak(
      {
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        lastActiveDate: profile.lastActiveDate,
        streakProtectionUsed: profile.streakProtectionUsed,
      },
      streakConfig,
      today
    );
    currentStreak = streakResult.currentStreak;
    longestStreak = streakResult.longestStreak;
    streakProtectionUsed = streakResult.streakProtectionUsed;
    streakUpdated = currentStreak !== profile.currentStreak;
  }

  // 2. Calculate XP with streak multiplier
  const baseXp = XP_VALUES[actionType];
  const multiplier = getStreakMultiplier(currentStreak);
  const xpAwarded = Math.round(baseXp * multiplier);

  // 3. Insert XP event
  db.insert(schema.gamificationXpEvents)
    .values({
      actionType,
      xpAmount: xpAwarded,
      multiplier,
      description: actionDescription(actionType),
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .run();

  // 4. Update daily log
  const dailyLog = getOrCreateDailyLog(today);
  const columnName = ACTION_TO_COLUMN[actionType];
  const updateValues: Record<string, unknown> = {
    totalActions: dailyLog.totalActions + 1,
    xpEarned: dailyLog.xpEarned + xpAwarded,
  };
  // Increment the specific action column
  updateValues[columnName] = (dailyLog[columnName as keyof typeof dailyLog] as number) + 1;

  db.update(schema.gamificationDailyLog)
    .set(updateValues)
    .where(eq(schema.gamificationDailyLog.id, dailyLog.id))
    .run();

  // Re-read daily log after update
  const updatedLog = db.select().from(schema.gamificationDailyLog).where(eq(schema.gamificationDailyLog.id, dailyLog.id)).get()!;

  // 5. Check daily goals and award bonus
  let dailyGoalsMet = false;
  let totalXpAwarded = xpAwarded;
  const goalResult = checkDailyGoals(
    { applications: updatedLog.applications, searches: updatedLog.searches, outreach: updatedLog.outreach, jobsSaved: updatedLog.jobsSaved },
    dailyGoals
  );
  if (goalResult.met && !updatedLog.goalsMetBonus) {
    dailyGoalsMet = true;
    totalXpAwarded += DAILY_GOAL_BONUS_XP;
    db.update(schema.gamificationDailyLog)
      .set({ goalsMetBonus: true })
      .where(eq(schema.gamificationDailyLog.id, updatedLog.id))
      .run();
    db.insert(schema.gamificationXpEvents)
      .values({
        actionType: "daily_goal_bonus" as string,
        xpAmount: DAILY_GOAL_BONUS_XP,
        multiplier: 1,
        description: "Daily goals completed!",
      })
      .run();
  }

  // 6. Update profile
  const newTotalXp = profile.totalXp + totalXpAwarded;
  const { level: newLevel } = calculateLevel(newTotalXp);

  db.update(schema.gamificationProfile)
    .set({
      totalXp: newTotalXp,
      level: newLevel,
      currentStreak,
      longestStreak,
      lastActiveDate: today,
      streakProtectionUsed,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.gamificationProfile.id, profile.id))
    .run();

  // 7. Check achievements
  const alreadyUnlocked = new Set(
    db.select({ achievementId: schema.gamificationAchievements.achievementId })
      .from(schema.gamificationAchievements)
      .all()
      .map((r) => r.achievementId)
  );

  const allTimeCounts = getAllTimeCounts();
  const now = new Date();
  const context: AchievementContext = {
    totalApplications: allTimeCounts.applications,
    totalSearches: allTimeCounts.searches,
    totalOutreach: allTimeCounts.outreach,
    totalInterviews: allTimeCounts.interviews,
    totalResumeUploads: allTimeCounts.resumeUploads,
    totalResumeAnalyses: allTimeCounts.resumeAnalyses,
    totalResumeTailors: allTimeCounts.resumeTailors,
    totalJobsSaved: allTimeCounts.jobsSaved,
    totalXp: newTotalXp,
    level: newLevel,
    currentStreak,
    longestStreak,
    todayGoalsMet: dailyGoalsMet || updatedLog.goalsMetBonus,
    currentHour: now.getHours(),
    currentDayOfWeek: now.getDay(),
    weekendActiveDays: getWeekendActiveDays(today),
  };

  const newAchievements = checkAndUnlockAchievements(context, alreadyUnlocked);
  let achievementXp = 0;
  for (const achievementId of newAchievements) {
    const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
    const xp = def?.xpReward ?? 0;
    achievementXp += xp;
    db.insert(schema.gamificationAchievements)
      .values({ achievementId, xpAwarded: xp })
      .run();
    db.insert(schema.gamificationXpEvents)
      .values({
        actionType: "achievement" as string,
        xpAmount: xp,
        multiplier: 1,
        description: `Achievement: ${def?.name ?? achievementId}`,
        metadata: JSON.stringify({ achievementId }),
      })
      .run();
  }

  // Update profile again if achievements awarded XP
  if (achievementXp > 0) {
    const finalXp = newTotalXp + achievementXp;
    const { level: finalLevel } = calculateLevel(finalXp);
    db.update(schema.gamificationProfile)
      .set({ totalXp: finalXp, level: finalLevel, updatedAt: new Date().toISOString() })
      .where(eq(schema.gamificationProfile.id, profile.id))
      .run();
    return {
      xpAwarded: totalXpAwarded + achievementXp,
      multiplier,
      newTotalXp: finalXp,
      newLevel: finalLevel,
      leveledUp: finalLevel > previousLevel,
      previousLevel,
      streakUpdated,
      currentStreak,
      achievementsUnlocked: newAchievements,
      dailyGoalsMet,
    };
  }

  return {
    xpAwarded: totalXpAwarded,
    multiplier,
    newTotalXp,
    newLevel,
    leveledUp: newLevel > previousLevel,
    previousLevel,
    streakUpdated,
    currentStreak,
    achievementsUnlocked: newAchievements,
    dailyGoalsMet,
  };
}

export function getStats(): GamificationStats {
  const profile = getOrCreateProfile();
  const today = getToday();
  const parsedStatsGoals = JSON.parse(profile.dailyGoals);
  const dailyGoals: DailyGoals = { applications: 0, searches: 0, outreach: 0, jobsSaved: 0, ...parsedStatsGoals };
  const streakConfig: StreakConfig = JSON.parse(profile.streakConfig);

  const todayLog = db.select().from(schema.gamificationDailyLog).where(eq(schema.gamificationDailyLog.date, today)).get();

  const goalResult = checkDailyGoals(
    {
      applications: todayLog?.applications ?? 0,
      searches: todayLog?.searches ?? 0,
      outreach: todayLog?.outreach ?? 0,
      jobsSaved: todayLog?.jobsSaved ?? 0,
    },
    dailyGoals
  );

  const { level, title } = calculateLevel(profile.totalXp);

  const recentEvents = db
    .select({
      description: schema.gamificationXpEvents.description,
      xp: schema.gamificationXpEvents.xpAmount,
      createdAt: schema.gamificationXpEvents.createdAt,
    })
    .from(schema.gamificationXpEvents)
    .orderBy(desc(schema.gamificationXpEvents.createdAt))
    .limit(10)
    .all();

  return {
    enabled: profile.enabled,
    totalXp: profile.totalXp,
    level,
    levelTitle: title,
    xpForCurrentLevel: xpForCurrentLevel(level),
    xpForNextLevel: xpForNextLevel(level),
    xpProgress: xpProgressPercent(profile.totalXp, level),
    currentStreak: profile.currentStreak,
    longestStreak: profile.longestStreak,
    dailyGoals: goalResult.progress,
    dailyGoalsMet: goalResult.met || (todayLog?.goalsMetBonus ?? false),
    todayXp: todayLog?.xpEarned ?? 0,
    todayActions: todayLog?.totalActions ?? 0,
    recentXpEvents: recentEvents,
    dailyGoalsConfig: dailyGoals,
    streakConfig,
  };
}

export function getDailyHistory(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  return db
    .select({
      date: schema.gamificationDailyLog.date,
      totalActions: schema.gamificationDailyLog.totalActions,
      xpEarned: schema.gamificationDailyLog.xpEarned,
      applications: schema.gamificationDailyLog.applications,
      searches: schema.gamificationDailyLog.searches,
      outreach: schema.gamificationDailyLog.outreach,
    })
    .from(schema.gamificationDailyLog)
    .where(gte(schema.gamificationDailyLog.date, sinceStr))
    .orderBy(schema.gamificationDailyLog.date)
    .all();
}

export function resetGamification() {
  db.delete(schema.gamificationXpEvents).run();
  db.delete(schema.gamificationDailyLog).run();
  db.delete(schema.gamificationAchievements).run();
  db.delete(schema.gamificationProfile).run();
}
