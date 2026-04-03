import type { ActionType } from "./types";

export const XP_VALUES: Record<ActionType, number> = {
  apply: 25,
  search: 5,
  save_job: 3,
  outreach: 20,
  interview: 30,
  resume_upload: 10,
  resume_analyze: 15,
  resume_tailor: 20,
  autopilot: 5,
};

export const DAILY_GOAL_BONUS_XP = 50;

export const LEVELS = [
  { level: 1, title: "Fresh Graduate", xpRequired: 0 },
  { level: 2, title: "Resume Polisher", xpRequired: 50 },
  { level: 3, title: "Job Browser", xpRequired: 150 },
  { level: 4, title: "Active Seeker", xpRequired: 350 },
  { level: 5, title: "Application Machine", xpRequired: 650 },
  { level: 6, title: "Network Builder", xpRequired: 1100 },
  { level: 7, title: "Interview Getter", xpRequired: 1700 },
  { level: 8, title: "Pipeline Pro", xpRequired: 2500 },
  { level: 9, title: "Offer Magnet", xpRequired: 3600 },
  { level: 10, title: "Career Captain", xpRequired: 5000 },
  { level: 11, title: "Job Market Veteran", xpRequired: 7000 },
  { level: 12, title: "Hiring Manager's Nightmare", xpRequired: 10000 },
  { level: 13, title: "Unstoppable Force", xpRequired: 14000 },
  { level: 14, title: "Industry Legend", xpRequired: 20000 },
  { level: 15, title: "Job Hunt Master", xpRequired: 30000 },
];

export function calculateLevel(totalXp: number): { level: number; title: string } {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].xpRequired) {
      return { level: LEVELS[i].level, title: LEVELS[i].title };
    }
  }
  return { level: 1, title: LEVELS[0].title };
}

export function getStreakMultiplier(streakDays: number): number {
  if (streakDays >= 60) return 1.75;
  if (streakDays >= 30) return 1.5;
  if (streakDays >= 14) return 1.3;
  if (streakDays >= 7) return 1.2;
  if (streakDays >= 3) return 1.1;
  return 1.0;
}

export function xpForCurrentLevel(level: number): number {
  const lvl = LEVELS.find((l) => l.level === level);
  return lvl?.xpRequired ?? 0;
}

export function xpForNextLevel(level: number): number {
  const next = LEVELS.find((l) => l.level === level + 1);
  return next?.xpRequired ?? LEVELS[LEVELS.length - 1].xpRequired;
}

export function xpProgressPercent(totalXp: number, level: number): number {
  const currentReq = xpForCurrentLevel(level);
  const nextReq = xpForNextLevel(level);
  if (nextReq === currentReq) return 100; // max level
  return Math.min(100, Math.round(((totalXp - currentReq) / (nextReq - currentReq)) * 100));
}

// Map action types to human-readable descriptions
export function actionDescription(actionType: ActionType): string {
  const map: Record<ActionType, string> = {
    apply: "Applied to a job",
    search: "Job search completed",
    save_job: "Saved a job",
    outreach: "Sent outreach",
    interview: "Scheduled an interview",
    resume_upload: "Uploaded a resume",
    resume_analyze: "Analyzed a resume",
    resume_tailor: "Tailored a resume",
    autopilot: "Ran autopilot search",
  };
  return map[actionType];
}
