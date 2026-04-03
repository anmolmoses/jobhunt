"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { LevelBadge } from "./level-badge";
import { StreakCounter } from "./streak-counter";
import { DailyGoalsBar } from "./daily-goals-bar";
import { cn } from "@/lib/utils";
import { Zap, Loader2 } from "lucide-react";
import Link from "next/link";

interface GamificationStats {
  enabled: boolean;
  totalXp: number;
  level: number;
  levelTitle: string;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpProgress: number;
  currentStreak: number;
  longestStreak: number;
  dailyGoals: Record<string, { target: number; current: number }>;
  dailyGoalsMet: boolean;
  todayXp: number;
  todayActions: number;
  recentXpEvents: { description: string; xp: number; createdAt: string }[];
}

export function GamificationWidget() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification")
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || !stats.enabled) return null;

  const xpToNext = stats.xpForNextLevel - stats.totalXp;

  return (
    <Link href="/gamification" className="block">
      <Card className="border-primary/20 hover:border-primary/40 transition-colors">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col gap-4 md:flex-row md:gap-6">
            {/* Left: Level + XP + Daily Goals */}
            <div className="flex-1 space-y-3">
              {/* Level and Streak row */}
              <div className="flex items-center justify-between">
                <LevelBadge level={stats.level} title={stats.levelTitle} />
                <StreakCounter count={stats.currentStreak} />
              </div>

              {/* XP Progress */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-foreground" />
                    <span className="text-xs font-medium">{stats.totalXp.toLocaleString()} XP</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {xpToNext > 0 ? `${xpToNext.toLocaleString()} to Level ${stats.level + 1}` : "Max Level"}
                  </span>
                </div>
                <Progress
                  value={stats.xpProgress}
                  className="h-2"
                  indicatorClassName="bg-primary"
                />
              </div>

              {/* Daily Goals */}
              <DailyGoalsBar goals={stats.dailyGoals} met={stats.dailyGoalsMet} />
            </div>

            {/* Right: Recent XP Events */}
            <div className="md:w-60 md:border-l md:pl-4">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">Recent Activity</p>
              <div className="space-y-1.5">
                {stats.recentXpEvents.slice(0, 4).map((ev, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground truncate">{ev.description}</span>
                    <Badge variant="secondary" className="text-[9px] shrink-0">
                      +{ev.xp}
                    </Badge>
                  </div>
                ))}
                {stats.recentXpEvents.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No activity yet</p>
                )}
              </div>
              {stats.todayXp > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <span className="text-[10px] text-muted-foreground">Today: </span>
                  <span className="text-[10px] font-medium text-foreground">{stats.todayXp} XP</span>
                  <span className="text-[10px] text-muted-foreground"> from {stats.todayActions} action{stats.todayActions !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
