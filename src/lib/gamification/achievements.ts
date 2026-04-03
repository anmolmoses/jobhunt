import type { AchievementDef, AchievementContext } from "./types";

export const ACHIEVEMENTS: AchievementDef[] = [
  // Application category
  { id: "first_application", name: "First Step", description: "Submit your first application", category: "application", xpReward: 25, icon: "Briefcase", check: (c) => c.totalApplications >= 1 },
  { id: "applications_5", name: "Getting Warmed Up", description: "Submit 5 applications", category: "application", xpReward: 50, icon: "Briefcase", check: (c) => c.totalApplications >= 5 },
  { id: "applications_10", name: "Double Digits", description: "Submit 10 applications", category: "application", xpReward: 75, icon: "Briefcase", check: (c) => c.totalApplications >= 10 },
  { id: "applications_25", name: "Quarter Century", description: "Submit 25 applications", category: "application", xpReward: 100, icon: "Briefcase", check: (c) => c.totalApplications >= 25 },
  { id: "applications_50", name: "Half Century", description: "Submit 50 applications", category: "application", xpReward: 150, icon: "Briefcase", check: (c) => c.totalApplications >= 50 },
  { id: "applications_100", name: "Centurion", description: "Submit 100 applications", category: "application", xpReward: 200, icon: "Briefcase", check: (c) => c.totalApplications >= 100 },

  // Search category
  { id: "first_search", name: "Explorer", description: "Run your first job search", category: "search", xpReward: 25, icon: "Search", check: (c) => c.totalSearches >= 1 },
  { id: "searches_10", name: "Deep Diver", description: "Run 10 job searches", category: "search", xpReward: 50, icon: "Search", check: (c) => c.totalSearches >= 10 },
  { id: "searches_50", name: "Market Analyst", description: "Run 50 job searches", category: "search", xpReward: 100, icon: "Search", check: (c) => c.totalSearches >= 50 },
  { id: "saved_10", name: "Curated Collection", description: "Save 10 jobs", category: "search", xpReward: 50, icon: "Bookmark", check: (c) => c.totalJobsSaved >= 10 },
  { id: "saved_50", name: "Job Hoarder", description: "Save 50 jobs", category: "search", xpReward: 100, icon: "Bookmark", check: (c) => c.totalJobsSaved >= 50 },

  // Networking category
  { id: "first_outreach", name: "Ice Breaker", description: "Send your first outreach", category: "networking", xpReward: 25, icon: "Users", check: (c) => c.totalOutreach >= 1 },
  { id: "outreach_5", name: "Connector", description: "Send 5 outreach messages", category: "networking", xpReward: 50, icon: "Users", check: (c) => c.totalOutreach >= 5 },
  { id: "outreach_10", name: "Networker", description: "Send 10 outreach messages", category: "networking", xpReward: 75, icon: "Users", check: (c) => c.totalOutreach >= 10 },
  { id: "outreach_25", name: "Social Butterfly", description: "Send 25 outreach messages", category: "networking", xpReward: 100, icon: "Users", check: (c) => c.totalOutreach >= 25 },

  // Resume category
  { id: "first_resume", name: "On Paper", description: "Upload your first resume", category: "resume", xpReward: 25, icon: "FileText", check: (c) => c.totalResumeUploads >= 1 },
  { id: "first_analysis", name: "Self-Aware", description: "Get your first resume analysis", category: "resume", xpReward: 25, icon: "FileText", check: (c) => c.totalResumeAnalyses >= 1 },
  { id: "first_tailor", name: "Custom Fit", description: "Tailor a resume for a specific job", category: "resume", xpReward: 50, icon: "FileText", check: (c) => c.totalResumeTailors >= 1 },
  { id: "tailors_5", name: "Bespoke Builder", description: "Tailor 5 resumes", category: "resume", xpReward: 75, icon: "FileText", check: (c) => c.totalResumeTailors >= 5 },

  // Interview category
  { id: "first_interview", name: "In The Room", description: "Schedule your first interview", category: "interview", xpReward: 50, icon: "Calendar", check: (c) => c.totalInterviews >= 1 },
  { id: "interviews_5", name: "Interview Veteran", description: "Schedule 5 interviews", category: "interview", xpReward: 100, icon: "Calendar", check: (c) => c.totalInterviews >= 5 },
  { id: "interviews_10", name: "Hot Commodity", description: "Schedule 10 interviews", category: "interview", xpReward: 150, icon: "Calendar", check: (c) => c.totalInterviews >= 10 },

  // Streak category
  { id: "streak_3", name: "Warm Up", description: "Maintain a 3-day streak", category: "streak", xpReward: 30, icon: "Flame", check: (c) => c.currentStreak >= 3 },
  { id: "streak_7", name: "Full Week", description: "Maintain a 7-day streak", category: "streak", xpReward: 75, icon: "Flame", check: (c) => c.currentStreak >= 7 },
  { id: "streak_14", name: "Fortnight Fighter", description: "Maintain a 14-day streak", category: "streak", xpReward: 100, icon: "Flame", check: (c) => c.currentStreak >= 14 },
  { id: "streak_30", name: "Monthly Warrior", description: "Maintain a 30-day streak", category: "streak", xpReward: 200, icon: "Flame", check: (c) => c.currentStreak >= 30 },
  { id: "streak_60", name: "Unstoppable", description: "Maintain a 60-day streak", category: "streak", xpReward: 300, icon: "Flame", check: (c) => c.currentStreak >= 60 },

  // Special category
  { id: "perfect_day", name: "Perfect Day", description: "Meet all daily goals in a single day", category: "special", xpReward: 50, icon: "Trophy", check: (c) => c.todayGoalsMet },
  { id: "weekend_warrior", name: "Weekend Warrior", description: "Be active on both Saturday and Sunday", category: "special", xpReward: 50, icon: "Trophy", check: (c) => c.weekendActiveDays >= 2 },
  { id: "early_bird", name: "Early Bird", description: "Complete an action before 8 AM", category: "special", xpReward: 25, icon: "Trophy", check: (c) => c.currentHour < 8 },
  { id: "night_owl", name: "Night Owl", description: "Complete an action after 10 PM", category: "special", xpReward: 25, icon: "Trophy", check: (c) => c.currentHour >= 22 },
  { id: "level_5", name: "Halfway There", description: "Reach level 5", category: "special", xpReward: 50, icon: "Trophy", check: (c) => c.level >= 5 },
  { id: "level_10", name: "Career Captain", description: "Reach level 10", category: "special", xpReward: 100, icon: "Trophy", check: (c) => c.level >= 10 },
  { id: "level_15", name: "Job Hunt Master", description: "Reach level 15", category: "special", xpReward: 200, icon: "Trophy", check: (c) => c.level >= 15 },
  { id: "xp_1000", name: "Grand", description: "Earn 1,000 total XP", category: "special", xpReward: 50, icon: "Trophy", check: (c) => c.totalXp >= 1000 },
  { id: "xp_5000", name: "Legendary", description: "Earn 5,000 total XP", category: "special", xpReward: 100, icon: "Trophy", check: (c) => c.totalXp >= 5000 },
];

export function checkAndUnlockAchievements(
  context: AchievementContext,
  alreadyUnlocked: Set<string>
): string[] {
  const newlyUnlocked: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(achievement.id)) continue;
    if (achievement.check(context)) {
      newlyUnlocked.push(achievement.id);
    }
  }
  return newlyUnlocked;
}
