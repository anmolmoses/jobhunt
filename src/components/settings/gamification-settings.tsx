"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Trophy, Save, Loader2, Trash2, Flame, Zap } from "lucide-react";

interface GamificationConfig {
  enabled: boolean;
  totalXp: number;
  level: number;
  levelTitle: string;
  currentStreak: number;
  dailyGoalsConfig: { applications: number; searches: number; outreach: number };
  streakConfig: { countToward: string[]; protectionDays: number };
}

const STREAK_CATEGORIES = [
  { id: "apply", label: "Applications" },
  { id: "search", label: "Searches" },
  { id: "outreach", label: "Outreach" },
  { id: "interview", label: "Interviews" },
  { id: "resume", label: "Resume work" },
];

export function GamificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [config, setConfig] = useState<GamificationConfig>({
    enabled: true,
    totalXp: 0,
    level: 1,
    levelTitle: "Fresh Graduate",
    currentStreak: 0,
    dailyGoalsConfig: { applications: 3, searches: 2, outreach: 1 },
    streakConfig: { countToward: ["apply", "search", "outreach", "interview", "resume"], protectionDays: 1 },
  });

  useEffect(() => {
    fetch("/api/gamification")
      .then((r) => r.json())
      .then((data: GamificationConfig) => {
        setConfig(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/gamification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          dailyGoals: config.dailyGoalsConfig,
          streakConfig: config.streakConfig,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        toast("Gamification settings saved", "success");
      } else {
        toast("Failed to save settings", "error");
      }
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/gamification/reset", { method: "POST" });
      if (res.ok) {
        toast("Gamification data reset", "success");
        setConfig((prev) => ({ ...prev, totalXp: 0, level: 1, levelTitle: "Fresh Graduate", currentStreak: 0 }));
      } else {
        toast("Failed to reset", "error");
      }
    } catch {
      toast("Failed to reset", "error");
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const toggleStreakCategory = (category: string) => {
    setConfig((prev) => {
      const current = prev.streakConfig.countToward;
      const updated = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      return { ...prev, streakConfig: { ...prev.streakConfig, countToward: updated } };
    });
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Gamification
        </CardTitle>
        <CardDescription>
          Track your job search progress with XP, levels, streaks, and achievements
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Enable Gamification</p>
            <p className="text-xs text-muted-foreground">
              {config.enabled ? "Earning XP and tracking streaks" : "Disabled — no XP or achievements"}
            </p>
          </div>
          <Button
            variant={config.enabled ? "default" : "outline"}
            size="sm"
            onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          >
            {config.enabled ? "Enabled" : "Disabled"}
          </Button>
        </div>

        {/* Current Stats */}
        <div className="rounded-lg border p-3 bg-muted/50">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-foreground" />
              <span className="font-medium">Level {config.level}</span>
              <span className="text-muted-foreground">- {config.levelTitle}</span>
            </div>
            <Badge variant="secondary" className="text-xs">{config.totalXp.toLocaleString()} XP</Badge>
            <div className="flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-foreground" />
              <span className="text-xs">{config.currentStreak} day streak</span>
            </div>
          </div>
        </div>

        {/* Daily Goals */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Daily Goals</Label>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Applications per day</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={config.dailyGoalsConfig.applications}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    dailyGoalsConfig: { ...prev.dailyGoalsConfig, applications: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Searches per day</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={config.dailyGoalsConfig.searches}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    dailyGoalsConfig: { ...prev.dailyGoalsConfig, searches: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Outreach per day</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={config.dailyGoalsConfig.outreach}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    dailyGoalsConfig: { ...prev.dailyGoalsConfig, outreach: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        {/* Streak Config */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Streak Rules</Label>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">What counts toward your streak:</Label>
            <div className="flex flex-wrap gap-2">
              {STREAK_CATEGORIES.map((cat) => {
                const active = config.streakConfig.countToward.includes(cat.id);
                return (
                  <Button
                    key={cat.id}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => toggleStreakCategory(cat.id)}
                  >
                    {cat.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Streak protection (days you can miss)</Label>
            <Select
              value={String(config.streakConfig.protectionDays)}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  streakConfig: { ...prev.streakConfig, protectionDays: parseInt(e.target.value) },
                }))
              }
            >
              <option value="0">None — miss a day, lose your streak</option>
              <option value="1">1 day — can miss one day without losing streak</option>
              <option value="2">2 days — can miss two days without losing streak</option>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Gamification
          </Button>

          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive font-medium">Reset all XP, streaks & achievements?</span>
              <Button variant="destructive" size="sm" onClick={handleReset} disabled={resetting}>
                {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, Reset"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              <Trash2 className="h-3 w-3" />
              Reset Data
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
