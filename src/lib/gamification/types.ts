export type ActionType =
  | "apply"
  | "search"
  | "save_job"
  | "outreach"
  | "interview"
  | "resume_upload"
  | "resume_analyze"
  | "resume_tailor"
  | "autopilot";

export interface DailyGoals {
  applications: number;
  searches: number;
  outreach: number;
  jobsSaved: number;
}

export interface StreakConfig {
  countToward: string[]; // action categories: "apply", "search", "outreach", "interview", "resume"
  protectionDays: number;
}

export interface GamificationResult {
  xpAwarded: number;
  multiplier: number;
  newTotalXp: number;
  newLevel: number;
  leveledUp: boolean;
  previousLevel: number;
  streakUpdated: boolean;
  currentStreak: number;
  achievementsUnlocked: string[];
  dailyGoalsMet: boolean;
}

export interface GamificationStats {
  enabled: boolean;
  totalXp: number;
  level: number;
  levelTitle: string;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpProgress: number; // 0-100
  currentStreak: number;
  longestStreak: number;
  dailyGoals: Record<string, { target: number; current: number }>;
  dailyGoalsMet: boolean;
  todayXp: number;
  todayActions: number;
  recentXpEvents: { description: string; xp: number; createdAt: string }[];
  dailyGoalsConfig: DailyGoals;
  streakConfig: StreakConfig;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: "application" | "search" | "networking" | "resume" | "interview" | "streak" | "special";
  xpReward: number;
  icon: string; // lucide icon name
  check: (ctx: AchievementContext) => boolean;
}

export interface AchievementContext {
  totalApplications: number;
  totalSearches: number;
  totalOutreach: number;
  totalInterviews: number;
  totalResumeUploads: number;
  totalResumeAnalyses: number;
  totalResumeTailors: number;
  totalJobsSaved: number;
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  todayGoalsMet: boolean;
  currentHour: number;
  currentDayOfWeek: number; // 0=Sunday
  weekendActiveDays: number; // 0, 1, or 2 for current weekend
}

export interface UnlockedAchievement {
  achievementId: string;
  unlockedAt: string;
  xpAwarded: number;
  notified: boolean;
}
