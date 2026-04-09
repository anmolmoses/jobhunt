"use client";

import { cn } from "@/lib/utils";

interface HeatmapDay {
  date: string;
  totalActions: number;
  xpEarned: number;
}

interface ActivityHeatmapProps {
  data: HeatmapDay[];
  className?: string;
}

function getIntensity(actions: number): string {
  if (actions === 0) return "bg-muted";
  if (actions <= 2) return "bg-green-200 dark:bg-green-900";
  if (actions <= 5) return "bg-green-400 dark:bg-green-700";
  if (actions <= 10) return "bg-green-500 dark:bg-green-500";
  return "bg-green-700 dark:bg-green-400";
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function ActivityHeatmap({ data, className }: ActivityHeatmapProps) {
  // Build a map of date -> data
  const dataMap = new Map(data.map((d) => [d.date, d]));

  // Generate 26 weeks (182 days) of dates ending today
  const today = new Date();
  const weeks: { date: string; dayOfWeek: number; data?: HeatmapDay }[][] = [];
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 181);

  // Adjust to start on a Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  let currentWeek: { date: string; dayOfWeek: number; data?: HeatmapDay }[] = [];
  const cursor = new Date(startDate);

  while (cursor <= today) {
    const dateStr = cursor.toISOString().split("T")[0];
    const dayOfWeek = cursor.getDay();

    currentWeek.push({
      date: dateStr,
      dayOfWeek,
      data: dataMap.get(dateStr),
    });

    if (dayOfWeek === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  // Month labels
  const months: { label: string; colStart: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const firstDay = week[0];
    if (firstDay) {
      const month = new Date(firstDay.date).getMonth();
      if (month !== lastMonth) {
        months.push({
          label: new Date(firstDay.date).toLocaleString("default", { month: "short" }),
          colStart: i,
        });
        lastMonth = month;
      }
    }
  });

  return (
    <div className={cn("space-y-1", className)}>
      {/* Month labels */}
      <div className="flex ml-8">
        {months.map((m, i) => (
          <span
            key={i}
            className="text-[10px] text-muted-foreground"
            style={{ marginLeft: i === 0 ? `${m.colStart * 14}px` : `${(m.colStart - (months[i - 1]?.colStart ?? 0) - 1) * 14}px` }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="h-[12px] flex items-center">
              <span className="text-[9px] text-muted-foreground w-6 text-right">{label}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-0.5">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const cell = week.find((d) => d.dayOfWeek === dayIdx);
                if (!cell) {
                  return <div key={dayIdx} className="h-[12px] w-[12px]" />;
                }
                const actions = cell.data?.totalActions ?? 0;
                return (
                  <div
                    key={dayIdx}
                    className={cn("h-[12px] w-[12px] rounded-sm", getIntensity(actions))}
                    title={`${cell.date}: ${actions} actions, ${cell.data?.xpEarned ?? 0} XP`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 ml-8 mt-1">
        <span className="text-[9px] text-muted-foreground">Less</span>
        <div className="h-[10px] w-[10px] rounded-sm bg-muted" />
        <div className="h-[10px] w-[10px] rounded-sm bg-green-200 dark:bg-green-900" />
        <div className="h-[10px] w-[10px] rounded-sm bg-green-400 dark:bg-green-700" />
        <div className="h-[10px] w-[10px] rounded-sm bg-green-500 dark:bg-green-500" />
        <div className="h-[10px] w-[10px] rounded-sm bg-green-700 dark:bg-green-400" />
        <span className="text-[9px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}
