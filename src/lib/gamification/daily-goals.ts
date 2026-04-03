import type { DailyGoals } from "./types";

interface DailyLogCounts {
  applications: number;
  searches: number;
  outreach: number;
}

export interface DailyGoalProgress {
  met: boolean;
  progress: Record<string, { target: number; current: number }>;
}

export function checkDailyGoals(
  counts: DailyLogCounts,
  goals: DailyGoals
): DailyGoalProgress {
  const progress: Record<string, { target: number; current: number }> = {};
  let allMet = true;

  if (goals.applications > 0) {
    progress.applications = { target: goals.applications, current: counts.applications };
    if (counts.applications < goals.applications) allMet = false;
  }
  if (goals.searches > 0) {
    progress.searches = { target: goals.searches, current: counts.searches };
    if (counts.searches < goals.searches) allMet = false;
  }
  if (goals.outreach > 0) {
    progress.outreach = { target: goals.outreach, current: counts.outreach };
    if (counts.outreach < goals.outreach) allMet = false;
  }

  // If no goals are configured, don't count as "met"
  if (Object.keys(progress).length === 0) allMet = false;

  return { met: allMet, progress };
}
