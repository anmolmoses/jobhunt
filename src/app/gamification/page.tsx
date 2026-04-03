"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LevelBadge } from "@/components/gamification/level-badge";
import { StreakCounter } from "@/components/gamification/streak-counter";
import { DailyGoalsBar } from "@/components/gamification/daily-goals-bar";
import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { AchievementCard } from "@/components/gamification/achievement-card";
import { cn } from "@/lib/utils";
import { Loader2, Zap, Trophy, Flame, Target, TrendingUp } from "lucide-react";

interface Stats {
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

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  xpReward: number;
  icon: string;
  unlocked: boolean;
  unlockedAt: string | null;
  notified: boolean;
}

interface HeatmapDay {
  date: string;
  totalActions: number;
  xpEarned: number;
}

const CATEGORY_ORDER = ["application", "search", "networking", "resume", "interview", "streak", "special"];
const CATEGORY_LABELS: Record<string, string> = {
  application: "Applications",
  search: "Search & Save",
  networking: "Networking",
  resume: "Resume",
  interview: "Interviews",
  streak: "Streaks",
  special: "Special",
};

export default function GamificationPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/gamification").then((r) => r.json()),
      fetch("/api/gamification/achievements").then((r) => r.json()),
      fetch("/api/gamification/history?days=182").then((r) => r.json()),
    ])
      .then(([statsData, achievementsData, historyData]) => {
        setStats(statsData);
        setAchievements(achievementsData);
        setHeatmapData(historyData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center text-muted-foreground py-12">Failed to load gamification data</div>;
  }

  if (!stats.enabled) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Gamification Disabled</h2>
        <p className="text-muted-foreground">Enable gamification in Settings to start tracking your progress</p>
      </div>
    );
  }

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalAchievements = achievements.length;
  const xpToNext = stats.xpForNextLevel - stats.totalXp;

  // Group achievements by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    achievements: achievements.filter((a) => a.category === cat),
  })).filter((g) => g.achievements.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Progress</h1>
        <p className="text-muted-foreground mt-1">Your job search gamification stats</p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Zap className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalXp.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total XP</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <LevelBadge level={stats.level} title={stats.levelTitle} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Flame className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <StreakCounter count={stats.currentStreak} />
                <p className="text-[10px] text-muted-foreground">Best: {stats.longestStreak} days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Trophy className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unlockedCount}<span className="text-sm text-muted-foreground font-normal">/{totalAchievements}</span></p>
                <p className="text-xs text-muted-foreground">Achievements</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* XP Progress to next level */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Level {stats.level} - {stats.levelTitle}</span>
            <span className="text-xs text-muted-foreground">
              {xpToNext > 0 ? `${xpToNext.toLocaleString()} XP to Level ${stats.level + 1}` : "Max Level"}
            </span>
          </div>
          <Progress value={stats.xpProgress} className="h-3" indicatorClassName="bg-primary" />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{stats.xpForCurrentLevel.toLocaleString()} XP</span>
            <span className="text-[10px] text-muted-foreground">{stats.xpForNextLevel.toLocaleString()} XP</span>
          </div>
        </CardContent>
      </Card>

      {/* Daily Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Today&apos;s Goals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyGoalsBar goals={stats.dailyGoals} met={stats.dailyGoalsMet} />
          {stats.dailyGoalsMet && (
            <div className="mt-3 rounded-lg bg-muted p-3 text-center">
              <p className="text-sm font-medium text-foreground">All daily goals met! +50 XP bonus</p>
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">
            Today: {stats.todayXp} XP earned from {stats.todayActions} action{stats.todayActions !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      {/* Activity Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityHeatmap data={heatmapData} />
        </CardContent>
      </Card>

      {/* Recent XP Events */}
      {stats.recentXpEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Recent XP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentXpEvents.map((ev, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm">{ev.description}</p>
                    <p className="text-[10px] text-muted-foreground">{formatRelativeTime(ev.createdAt)}</p>
                  </div>
                  <Badge variant="secondary">+{ev.xp} XP</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Achievements */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Achievements
          <Badge variant="secondary">{unlockedCount}/{totalAchievements}</Badge>
        </h2>

        {grouped.map((group) => {
          const groupUnlocked = group.achievements.filter((a) => a.unlocked).length;
          return (
            <div key={group.category} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <span className="text-xs text-muted-foreground">{groupUnlocked}/{group.achievements.length}</span>
              </div>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {group.achievements.map((a) => (
                  <AchievementCard key={a.id} {...a} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
