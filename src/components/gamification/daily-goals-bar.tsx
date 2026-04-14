import { cn } from "@/lib/utils";
import { CheckCircle } from "lucide-react";

interface DailyGoalsBarProps {
  goals: Record<string, { target: number; current: number }>;
  met: boolean;
  className?: string;
}

const GOAL_LABELS: Record<string, string> = {
  applications: "Applications",
  searches: "Searches",
  outreach: "Outreach",
  jobsSaved: "Jobs Saved",
};

export function DailyGoalsBar({ goals, met, className }: DailyGoalsBarProps) {
  const entries = Object.entries(goals);
  if (entries.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Daily Goals</span>
        {met && <CheckCircle className="h-3.5 w-3.5 text-foreground" />}
      </div>
      <div className="flex gap-4">
        {entries.map(([key, { target, current }]) => {
          const pct = Math.min(100, Math.round((current / target) * 100));
          const done = current >= target;
          return (
            <div key={key} className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] text-muted-foreground truncate">
                  {GOAL_LABELS[key] || key}
                </span>
                <span className={cn("text-[10px] font-medium tabular-nums", "text-foreground")}>
                  {current}/{target}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    "bg-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
