"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  X,
  Tag,
  HelpCircle,
} from "lucide-react";

interface InterviewStory {
  id: number;
  title: string;
  theme: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string | null;
  skills: string[];
  questionsItAnswers: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

const THEMES = [
  "leadership",
  "conflict",
  "failure",
  "innovation",
  "teamwork",
  "technical",
  "communication",
  "growth",
] as const;

type Theme = (typeof THEMES)[number];

const THEME_LABELS: Record<Theme, string> = {
  leadership: "Leadership",
  conflict: "Conflict",
  failure: "Failure",
  innovation: "Innovation",
  teamwork: "Teamwork",
  technical: "Technical",
  communication: "Communication",
  growth: "Growth",
};

const emptyForm = {
  title: "",
  theme: "leadership" as Theme,
  situation: "",
  task: "",
  action: "",
  result: "",
  reflection: "",
  skillsInput: "",
  questionsItAnswers: [] as string[],
  questionInput: "",
};

export default function InterviewPrepPage() {
  const { toast } = useToast();
  const [stories, setStories] = useState<InterviewStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTheme, setFilterTheme] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      const res = await fetch("/api/interview-stories");
      const data = await res.json();
      setStories(Array.isArray(data) ? data : []);
    } catch {
      toast("Failed to load stories", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.situation || !form.task || !form.action || !form.result) {
      toast("Please fill in all required STAR fields", "error");
      return;
    }

    const skills = form.skillsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      id: editingId,
      title: form.title,
      theme: form.theme,
      situation: form.situation,
      task: form.task,
      action: form.action,
      result: form.result,
      reflection: form.reflection || null,
      skills,
      questionsItAnswers: form.questionsItAnswers,
    };

    try {
      const res = await fetch("/api/interview-stories", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast(err.error || "Failed to save story", "error");
        return;
      }

      toast(editingId ? "Story updated" : "Story created", "success");
      resetForm();
      loadStories();
    } catch {
      toast("Failed to save story", "error");
    }
  };

  const handleEdit = (story: InterviewStory) => {
    setForm({
      title: story.title,
      theme: story.theme as Theme,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
      reflection: story.reflection || "",
      skillsInput: story.skills.join(", "),
      questionsItAnswers: story.questionsItAnswers,
      questionInput: "",
    });
    setEditingId(story.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/interview-stories?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast("Failed to delete story", "error");
        return;
      }
      setStories((prev) => prev.filter((s) => s.id !== id));
      toast("Story deleted", "success");
    } catch {
      toast("Failed to delete story", "error");
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const addQuestion = () => {
    if (!form.questionInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      questionsItAnswers: [...prev.questionsItAnswers, prev.questionInput.trim()],
      questionInput: "",
    }));
  };

  const removeQuestion = (index: number) => {
    setForm((prev) => ({
      ...prev,
      questionsItAnswers: prev.questionsItAnswers.filter((_, i) => i !== index),
    }));
  };

  const toggleSection = (storyId: number, section: string) => {
    const key = `${storyId}-${section}`;
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isSectionExpanded = (storyId: number, section: string) => {
    return expandedSections[`${storyId}-${section}`] ?? false;
  };

  const filteredStories =
    filterTheme === "all"
      ? stories
      : stories.filter((s) => s.theme === filterTheme);

  const themeCounts = stories.reduce(
    (acc, s) => {
      acc[s.theme] = (acc[s.theme] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Interview Story Bank</h1>
          <p className="text-muted-foreground mt-1">
            Prepare STAR+Reflection stories for behavioral interviews
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add Story
          </Button>
        )}
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{stories.length}</span>{" "}
          {stories.length === 1 ? "story" : "stories"} total
        </div>
        <div className="h-4 w-px bg-border" />
        {THEMES.map((theme) =>
          themeCounts[theme] ? (
            <Badge key={theme} variant="secondary" className="text-xs">
              {THEME_LABELS[theme]} ({themeCounts[theme]})
            </Badge>
          ) : null
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingId ? "Edit Story" : "New Story"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title *</label>
                <Input
                  placeholder="e.g. Led database migration under tight deadline"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Theme *</label>
                <Select
                  value={form.theme}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, theme: e.target.value as Theme }))
                  }
                >
                  {THEMES.map((t) => (
                    <option key={t} value={t}>
                      {THEME_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Situation *</label>
              <Textarea
                placeholder="Set the scene. What was the context?"
                rows={3}
                value={form.situation}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, situation: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Task *</label>
              <Textarea
                placeholder="What was your specific responsibility?"
                rows={2}
                value={form.task}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, task: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Action *</label>
              <Textarea
                placeholder="What did you do? Be specific about YOUR contributions."
                rows={3}
                value={form.action}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, action: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Result *</label>
              <Textarea
                placeholder="What was the outcome? Include metrics if possible."
                rows={2}
                value={form.result}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, result: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reflection</label>
              <Textarea
                placeholder="What did you learn? What would you do differently?"
                rows={2}
                value={form.reflection}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reflection: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Skills (comma-separated)</label>
              <Input
                placeholder="e.g. project management, SQL, stakeholder communication"
                value={form.skillsInput}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, skillsInput: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Questions this answers</label>
              <div className="flex gap-2">
                <Input
                  placeholder='e.g. "Tell me about a time you led a team..."'
                  value={form.questionInput}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, questionInput: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addQuestion();
                    }
                  }}
                />
                <Button variant="outline" onClick={addQuestion} type="button">
                  Add
                </Button>
              </div>
              {form.questionsItAnswers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.questionsItAnswers.map((q, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      <span className="max-w-[300px] truncate">{q}</span>
                      <button
                        onClick={() => removeQuestion(i)}
                        className="ml-1 rounded-full hover:bg-foreground/10 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave}>
                {editingId ? "Update Story" : "Save Story"}
              </Button>
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Theme Filter Bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTheme("all")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            filterTheme === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-accent"
          }`}
        >
          All ({stories.length})
        </button>
        {THEMES.map((theme) => (
          <button
            key={theme}
            onClick={() => setFilterTheme(theme)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filterTheme === theme
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            }`}
          >
            {THEME_LABELS[theme]} ({themeCounts[theme] || 0})
          </button>
        ))}
      </div>

      {/* Story Cards */}
      {filteredStories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {stories.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                <p>No stories yet. Add your first STAR story to get started!</p>
              </div>
            ) : (
              <p>No stories with theme &ldquo;{THEME_LABELS[filterTheme as Theme]}&rdquo;</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredStories.map((story) => (
            <Card key={story.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{story.title}</CardTitle>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {THEME_LABELS[story.theme as Theme] || story.theme}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* STAR Sections */}
                {(
                  [
                    { key: "situation", label: "Situation", value: story.situation },
                    { key: "task", label: "Task", value: story.task },
                    { key: "action", label: "Action", value: story.action },
                    { key: "result", label: "Result", value: story.result },
                  ] as const
                ).map((section) => (
                  <div key={section.key}>
                    <button
                      onClick={() => toggleSection(story.id, section.key)}
                      className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80 transition-colors w-full text-left"
                    >
                      {isSectionExpanded(story.id, section.key) ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {section.label}
                    </button>
                    {isSectionExpanded(story.id, section.key) && (
                      <p className="text-sm text-muted-foreground mt-1 ml-5 whitespace-pre-wrap">
                        {section.value}
                      </p>
                    )}
                  </div>
                ))}

                {/* Reflection */}
                {story.reflection && (
                  <div>
                    <button
                      onClick={() => toggleSection(story.id, "reflection")}
                      className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80 transition-colors w-full text-left"
                    >
                      {isSectionExpanded(story.id, "reflection") ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                      Reflection
                    </button>
                    {isSectionExpanded(story.id, "reflection") && (
                      <p className="text-sm text-muted-foreground mt-1 ml-5 whitespace-pre-wrap">
                        {story.reflection}
                      </p>
                    )}
                  </div>
                )}

                {/* Skills Tags */}
                {story.skills.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    {story.skills.map((skill, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Questions This Answers */}
                {story.questionsItAnswers.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <HelpCircle className="h-3 w-3" />
                      Questions this answers
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-0.5 ml-4.5">
                      {story.questionsItAnswers.map((q, i) => (
                        <li key={i} className="list-disc ml-1">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(story)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(story.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">Delete</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
