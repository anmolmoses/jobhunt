"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/preferences/tag-input";
import { useToast } from "@/components/ui/toast";
import { Save, Sparkles, Loader2, Wand2 } from "lucide-react";
import type { PreferenceQuestion } from "@/types/ai";

interface Preferences {
  desiredRoles: string[];
  desiredIndustries: string[];
  experienceLevel: string[];
  locationPreference: string[];
  preferredLocations: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string[];
  desiredSkills: string[];
  excludeKeywords: string[];
  companySizePreference: string[];
  additionalNotes: string | null;
}

const defaultPrefs: Preferences = {
  desiredRoles: [],
  desiredIndustries: [],
  experienceLevel: ["mid"],
  locationPreference: ["remote"],
  preferredLocations: [],
  salaryMin: null,
  salaryMax: null,
  employmentType: ["full_time"],
  desiredSkills: [],
  excludeKeywords: [],
  companySizePreference: ["startup", "mid", "enterprise"],
  additionalNotes: null,
};

export default function PreferencesPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [questions, setQuestions] = useState<PreferenceQuestion[]>([]);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setPrefs({ ...defaultPrefs, ...data });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateField = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast("Preferences saved!", "success");
    } catch {
      toast("Failed to save preferences", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFill = async () => {
    setAutoFilling(true);
    try {
      const res = await fetch("/api/preferences/auto-generate", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to auto-generate");
      }
      const data = await res.json();
      setPrefs({ ...defaultPrefs, ...data.preferences });
      toast(
        `AI extracted ${data.preferences.desiredRoles?.length || 0} roles, ${data.preferences.desiredSkills?.length || 0} skills. Review and save!`,
        "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setAutoFilling(false);
    }
  };

  const handleAIGuide = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/preferences/questions", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate questions");
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setShowQuestionnaire(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAnswers = () => {
    const updated = { ...prefs };
    for (const q of questions) {
      const answer = answers[q.id];
      if (answer === undefined) continue;

      const field = q.fieldMapping as keyof Preferences;
      if (Array.isArray(updated[field]) && typeof answer === "string") {
        (updated[field] as string[]) = answer.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(answer)) {
        (updated[field] as string[]) = answer as string[];
      } else if (typeof answer === "number") {
        (updated[field] as number | null) = answer;
      } else {
        (updated[field] as string) = answer as string;
      }
    }
    setPrefs(updated);
    setShowQuestionnaire(false);
    toast("Answers applied to preferences!", "success");
  };

  const toggleEmploymentType = (type: string) => {
    setPrefs((prev) => ({
      ...prev,
      employmentType: prev.employmentType.includes(type)
        ? prev.employmentType.filter((t) => t !== type)
        : [...prev.employmentType, type],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Job Preferences</h1>
          <p className="text-muted-foreground mt-1">Set your job search criteria</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAutoFill} disabled={autoFilling}>
            {autoFilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {autoFilling ? "Extracting..." : "Auto-fill from Resume"}
          </Button>
          <Button variant="outline" onClick={handleAIGuide} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI Questionnaire
          </Button>
        </div>
      </div>

      {/* AI Questionnaire */}
      {showQuestionnaire && questions.length > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Career Strategy Questions</CardTitle>
            <CardDescription>AI crafted these based on your resume. Your answers shape the job search.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {questions.map((q, idx) => (
              <div key={q.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-sm leading-snug">{q.question}</Label>
                    {(q as { context?: string }).context && (
                      <p className="text-xs text-muted-foreground italic">
                        {(q as { context?: string }).context}
                      </p>
                    )}
                  </div>
                </div>
                {q.type === "text" && (
                  <Input
                    value={(answers[q.id] as string) || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                )}
                {q.type === "select" && (
                  <Select
                    value={(answers[q.id] as string) || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    {q.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                )}
                {q.type === "multiselect" && (
                  <div className="flex flex-wrap gap-2">
                    {q.options?.map((opt) => {
                      const selected = ((answers[q.id] as string[]) || []).includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            const current = (answers[q.id] as string[]) || [];
                            setAnswers((a) => ({
                              ...a,
                              [q.id]: selected
                                ? current.filter((v) => v !== opt)
                                : [...current, opt],
                            }));
                          }}
                          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input hover:bg-accent"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.type === "range" && (
                  <Input
                    type="number"
                    min={q.min}
                    max={q.max}
                    value={(answers[q.id] as number) || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: parseInt(e.target.value) || 0 }))}
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={applyAnswers}>Apply Answers</Button>
              <Button variant="outline" onClick={() => setShowQuestionnaire(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Form */}
      <Card>
        <CardHeader>
          <CardTitle>Desired Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <TagInput
            value={prefs.desiredRoles}
            onChange={(v) => updateField("desiredRoles", v)}
            placeholder="e.g. Frontend Developer, React Engineer..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <TagInput
            value={prefs.desiredSkills}
            onChange={(v) => updateField("desiredSkills", v)}
            placeholder="e.g. React, TypeScript, Node.js..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience Level</CardTitle>
          <CardDescription>Select all levels you&apos;re open to</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "entry", label: "Entry Level" },
              { value: "mid", label: "Mid Level" },
              { value: "senior", label: "Senior" },
              { value: "lead", label: "Lead / Staff" },
              { value: "executive", label: "Director+" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setPrefs((prev) => ({
                    ...prev,
                    experienceLevel: prev.experienceLevel.includes(value)
                      ? prev.experienceLevel.filter((t) => t !== value)
                      : [...prev.experienceLevel, value],
                  }));
                }}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  prefs.experienceLevel.includes(value)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Work Arrangement</CardTitle>
            <CardDescription>Select all that you&apos;re open to</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "remote", label: "Remote" },
                { value: "hybrid", label: "Hybrid" },
                { value: "onsite", label: "On-site" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    setPrefs((prev) => ({
                      ...prev,
                      locationPreference: prev.locationPreference.includes(value)
                        ? prev.locationPreference.filter((t) => t !== value)
                        : [...prev.locationPreference, value],
                    }));
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    prefs.locationPreference.includes(value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company Size</CardTitle>
            <CardDescription>Select all sizes you&apos;re open to</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "startup", label: "Startup (1-200)" },
                { value: "mid", label: "Mid-size (200-1000)" },
                { value: "enterprise", label: "Enterprise (1000+)" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    setPrefs((prev) => ({
                      ...prev,
                      companySizePreference: prev.companySizePreference.includes(value)
                        ? prev.companySizePreference.filter((t) => t !== value)
                        : [...prev.companySizePreference, value],
                    }));
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    prefs.companySizePreference.includes(value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preferred Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <TagInput
            value={prefs.preferredLocations}
            onChange={(v) => updateField("preferredLocations", v)}
            placeholder="e.g. San Francisco, New York..."
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Salary Range (Annual USD)</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <div className="flex-1 space-y-1">
              <Label>Min</Label>
              <Input
                type="number"
                value={prefs.salaryMin || ""}
                onChange={(e) => updateField("salaryMin", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="80000"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Max</Label>
              <Input
                type="number"
                value={prefs.salaryMax || ""}
                onChange={(e) => updateField("salaryMax", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="150000"
              />
            </div>
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employment Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {[
              { value: "full_time", label: "Full-time" },
              { value: "contract", label: "Contract" },
              { value: "part_time", label: "Part-time" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleEmploymentType(value)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  prefs.employmentType.includes(value)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Industries</CardTitle>
        </CardHeader>
        <CardContent>
          <TagInput
            value={prefs.desiredIndustries}
            onChange={(v) => updateField("desiredIndustries", v)}
            placeholder="e.g. Tech, Finance, Healthcare..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exclude Keywords</CardTitle>
          <CardDescription>Jobs containing these keywords will be filtered out</CardDescription>
        </CardHeader>
        <CardContent>
          <TagInput
            value={prefs.excludeKeywords}
            onChange={(v) => updateField("excludeKeywords", v)}
            placeholder="e.g. clearance, relocation required..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={prefs.additionalNotes || ""}
            onChange={(e) => updateField("additionalNotes", e.target.value || null)}
            placeholder="Any other preferences or requirements..."
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
