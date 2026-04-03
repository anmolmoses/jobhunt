import type { StreakConfig } from "./types";

interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  streakProtectionUsed: boolean;
}

interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  streakProtectionUsed: boolean;
}

export function updateStreak(
  state: StreakState,
  config: StreakConfig,
  today: string // YYYY-MM-DD
): StreakUpdateResult {
  const { lastActiveDate, streakProtectionUsed } = state;
  let { currentStreak, longestStreak } = state;

  if (!lastActiveDate) {
    // First ever activity
    currentStreak = 1;
    longestStreak = Math.max(longestStreak, 1);
    return { currentStreak, longestStreak, lastActiveDate: today, streakProtectionUsed: false };
  }

  if (lastActiveDate === today) {
    // Already active today — no change
    return { currentStreak, longestStreak, lastActiveDate: today, streakProtectionUsed: state.streakProtectionUsed };
  }

  const lastDate = new Date(lastActiveDate + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");
  const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    // Consecutive day — extend streak
    currentStreak += 1;
  } else if (diffDays <= 1 + config.protectionDays && !streakProtectionUsed) {
    // Within protection window — preserve streak (use protection)
    currentStreak += 1;
    longestStreak = Math.max(longestStreak, currentStreak);
    return { currentStreak, longestStreak, lastActiveDate: today, streakProtectionUsed: true };
  } else {
    // Streak broken — reset
    currentStreak = 1;
  }

  longestStreak = Math.max(longestStreak, currentStreak);
  return { currentStreak, longestStreak, lastActiveDate: today, streakProtectionUsed: false };
}

// Map action types to streak categories
const ACTION_TO_CATEGORY: Record<string, string> = {
  apply: "apply",
  search: "search",
  save_job: "search",
  outreach: "outreach",
  interview: "interview",
  resume_upload: "resume",
  resume_analyze: "resume",
  resume_tailor: "resume",
  autopilot: "search",
};

export function actionCountsTowardStreak(actionType: string, config: StreakConfig): boolean {
  const category = ACTION_TO_CATEGORY[actionType];
  return category ? config.countToward.includes(category) : false;
}
