"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/jobs/job-card";
import { JobDetailModal } from "@/components/jobs/job-detail-modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Loader2, FileText, Search, Bookmark, TrendingUp,
  CheckCircle, Circle, ArrowRight, Settings, SlidersHorizontal,
  Sparkles, Rocket, Zap, Brain, MapPin, Briefcase, Clock,
  AlertCircle, User,
} from "lucide-react";
import type { NormalizedJob } from "@/types/jobs";
import { GamificationWidget } from "@/components/gamification/gamification-widget";

type ExtendedJob = NormalizedJob & { dbId?: number };

interface DashboardData {
  resumeScore: number | null;
  savedJobsCount: number;
  totalJobsFound: number;
  searchesThisWeek: number;
  statusCounts: Record<string, number>;
  recentSearches: { id: number; query: string; totalResults: number; createdAt: string }[];
  recentSaved: { id: number; status: string; job: { title: string; company: string } }[];
  setup: {
    hasApiKeys: boolean;
    hasResume: boolean;
    hasPreferences: boolean;
    hasAnalysis: boolean;
    hasSearched: boolean;
  };
}

interface StepState {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  detail?: string;
}

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = "stroke-foreground";
  const textColor = "text-foreground";
  return (
    <div className="relative h-32 w-32">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className={color} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-bold", textColor)}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Autopilot
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [autopilotJobs, setAutopilotJobs] = useState<ExtendedJob[]>([]);
  const [searchContext, setSearchContext] = useState<{
    resume?: string;
    score?: number;
    roles?: string[];
    skills?: string[];
    location?: string;
    queries?: string[];
  }>({});
  const [selectedJob, setSelectedJob] = useState<ExtendedJob | null>(null);
  const [savedJobIds, setSavedJobIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    fetch("/api/jobs/save").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setSavedJobIds(new Set(d.map((s: { jobResultId: number }) => s.jobResultId)));
    }).catch(() => {});
  }, []);

  const updateStep = useCallback((id: string, update: Partial<StepState>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  }, []);

  const handleAutopilot = async () => {
    setAutopilotRunning(true);
    setAutopilotJobs([]);
    setSearchContext({});

    const initialSteps: StepState[] = [
      { id: "resume", label: "Finding your resume", status: "pending" },
      { id: "analyze", label: "Analyzing resume with AI", status: "pending" },
      { id: "preferences", label: "Extracting job preferences", status: "pending" },
      { id: "search", label: "Searching across job boards", status: "pending" },
    ];
    setSteps(initialSteps);

    try {
      // Step 1: Check resume
      updateStep("resume", { status: "running" });
      const resumeRes = await fetch("/api/resume/latest");
      if (!resumeRes.ok || resumeRes.status === 404) {
        updateStep("resume", { status: "error", detail: "No resume found. Upload one first." });
        setAutopilotRunning(false);
        return;
      }
      const resumeData = await resumeRes.json();
      if (!resumeData?.parsedText) {
        updateStep("resume", { status: "error", detail: "No resume found. Upload one first." });
        setAutopilotRunning(false);
        return;
      }
      updateStep("resume", { status: "done", detail: resumeData.fileName });
      setSearchContext((prev) => ({ ...prev, resume: resumeData.fileName }));

      // Step 2: Check/run analysis
      updateStep("analyze", { status: "running" });
      const hasAnalysis = resumeData.analyses?.length > 0;
      if (hasAnalysis) {
        const latestAnalysis = resumeData.analyses[resumeData.analyses.length - 1];
        updateStep("analyze", { status: "skipped", detail: `Already scored ${latestAnalysis.overallScore}/100` });
        setSearchContext((prev) => ({ ...prev, score: latestAnalysis.overallScore }));
      } else {
        updateStep("analyze", { status: "running", detail: "Running AI analysis..." });
        try {
          const analyzeRes = await fetch("/api/resume/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resumeId: resumeData.id }),
          });
          if (analyzeRes.ok) {
            const analysis = await analyzeRes.json();
            updateStep("analyze", { status: "done", detail: `Scored ${analysis.overallScore}/100` });
            setSearchContext((prev) => ({ ...prev, score: analysis.overallScore }));
          } else {
            updateStep("analyze", { status: "error", detail: "Analysis failed — continuing without it" });
          }
        } catch {
          updateStep("analyze", { status: "error", detail: "Analysis failed — continuing without it" });
        }
      }

      // Step 3: Extract preferences + load search config
      updateStep("preferences", { status: "running", detail: "AI is reading your resume..." });
      try {
        // Fetch search config and AI preferences in parallel
        const [prefRes, configRes] = await Promise.all([
          fetch("/api/preferences/auto-generate", { method: "POST" }),
          fetch("/api/search-config"),
        ]);

        // Parse search config
        let customQueries: string[] = [];
        let useCustomOnly = false;
        let configDatePosted = "7d";
        let maxQueries = 3;
        if (configRes.ok) {
          const config = await configRes.json();
          customQueries = config.customQueries || [];
          useCustomOnly = config.useCustomQueriesOnly || false;
          configDatePosted = config.datePosted || "7d";
          maxQueries = config.maxQueries || 3;
        }

        if (prefRes.ok) {
          const prefData = await prefRes.json();
          const prefs = prefData.preferences || {};
          const aiQueries: string[] = prefData.searchQueries || [];
          const roles = prefs.desiredRoles || [];
          const skills = prefs.desiredSkills || [];
          const locations = prefs.preferredLocations || [];

          // Build final query list: honor custom queries setting
          let finalQueries: string[];
          if (useCustomOnly && customQueries.length > 0) {
            finalQueries = customQueries;
          } else if (customQueries.length > 0) {
            finalQueries = [...customQueries, ...aiQueries.filter((q: string) => !customQueries.includes(q))];
          } else if (aiQueries.length > 0) {
            finalQueries = aiQueries;
          } else {
            finalQueries = roles.length > 0 ? [roles.join(", ")] : ["software developer"];
          }

          // When using custom queries only, run all of them; otherwise respect maxQueries
          const queriesToRun = useCustomOnly ? finalQueries : finalQueries.slice(0, maxQueries);

          updateStep("preferences", {
            status: "done",
            detail: `${roles.length} roles, ${skills.length} skills, ${locations.length ? locations[0] : "remote"}`,
          });
          setSearchContext((prev) => ({
            ...prev,
            roles,
            skills: skills.slice(0, 8),
            location: locations[0] || "Remote",
            queries: queriesToRun,
          }));

          // Step 4: Search
          updateStep("search", { status: "running", detail: `Searching ${queriesToRun.length} ${useCustomOnly ? "custom" : ""} queries across job boards...` });

          const allJobs: ExtendedJob[] = [];
          for (let i = 0; i < queriesToRun.length; i++) {
            const q = queriesToRun[i];
            updateStep("search", {
              status: "running",
              detail: `[${i + 1}/${queriesToRun.length}] Searching: "${q}"${locations[0] ? ` in ${locations[0]}` : ""}`,
            });

            try {
              const searchRes = await fetch("/api/jobs/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  query: q,
                  location: locations[0] || undefined,
                  datePosted: configDatePosted,
                  experienceLevel: prefs.experienceLevel || undefined,
                }),
              });
              if (searchRes.ok) {
                const searchData = await searchRes.json();
                const newJobs = (searchData.jobs || []) as ExtendedJob[];
                allJobs.push(...newJobs);
                setAutopilotJobs([...allJobs]); // Update UI incrementally
              }
            } catch {
              // Individual query failure doesn't stop others
            }
          }

          // Deduplicate across queries
          const seen = new Set<string>();
          const unique = allJobs.filter((j) => {
            const key = `${j.title}|${j.company}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setAutopilotJobs(unique);

          updateStep("search", {
            status: unique.length > 0 ? "done" : "error",
            detail: `Found ${unique.length} unique jobs`,
          });

          if (unique.length > 0) {
            toast(`Found ${unique.length} jobs matching your profile!`, "success");
          } else {
            toast("No jobs found. Try expanding your preferences or check API keys.", "info");
          }
        } else {
          const err = await prefRes.json();
          updateStep("preferences", { status: "error", detail: err.error || "Failed to extract preferences" });
          updateStep("search", { status: "error", detail: "Skipped — no preferences" });
        }
      } catch (e) {
        updateStep("preferences", { status: "error", detail: "Failed to extract preferences" });
        updateStep("search", { status: "error", detail: "Skipped — no preferences" });
      }

      // Refresh dashboard
      const dashRes = await fetch("/api/dashboard");
      setData(await dashRes.json());
    } catch {
      toast("Something went wrong. Check your API keys in Settings.", "error");
    } finally {
      setAutopilotRunning(false);
    }
  };

  const handleSave = async (job: ExtendedJob) => {
    if (!job.dbId) return;
    try {
      const res = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResultId: job.dbId }),
      });
      if (res.ok) {
        setSavedJobIds((prev) => new Set(prev).add(job.dbId!));
        toast("Job saved!", "success");
      }
    } catch { toast("Failed to save", "error"); }
  };

  const handleUnsave = async (job: ExtendedJob) => {
    if (!job.dbId) return;
    try {
      await fetch("/api/jobs/save", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResultId: job.dbId }),
      });
      setSavedJobIds((prev) => { const n = new Set(prev); n.delete(job.dbId!); return n; });
    } catch { toast("Failed to unsave", "error"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-12">Failed to load dashboard</div>;
  }

  const setupSteps = [
    { done: data.setup.hasApiKeys, label: "Configure API keys", href: "/settings", icon: Settings },
    { done: data.setup.hasResume, label: "Upload your resume", href: "/resume", icon: FileText },
  ];
  const canAutopilot = data.setup.hasResume;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your AI-powered job search command center</p>
      </div>

      {/* Main CTA */}
      <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Rocket className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Find Jobs For Me</h2>
                <p className="text-sm text-muted-foreground">
                  AI reads your resume, extracts preferences, and searches across LinkedIn, JSearch, Adzuna & Remotive
                </p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleAutopilot}
              disabled={autopilotRunning || !canAutopilot}
              className="min-w-[200px]"
            >
              {autopilotRunning ? (
                <><Loader2 className="h-5 w-5 animate-spin" />Working...</>
              ) : (
                <><Zap className="h-5 w-5" />{canAutopilot ? "Find Jobs For Me" : "Upload Resume First"}</>
              )}
            </Button>
          </div>

          {/* Live Progress Steps */}
          {steps.length > 0 && (
            <div className="mt-6 border-t pt-4 space-y-3">
              {steps.map((step) => (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {step.status === "pending" && <Circle className="h-5 w-5 text-muted-foreground" />}
                    {step.status === "running" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    {step.status === "done" && <CheckCircle className="h-5 w-5 text-foreground" />}
                    {step.status === "skipped" && <CheckCircle className="h-5 w-5 text-muted-foreground" />}
                    {step.status === "error" && <AlertCircle className="h-5 w-5 text-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium",
                      step.status === "pending" && "text-muted-foreground",
                      step.status === "running" && "text-foreground",
                      step.status === "done" && "text-foreground",
                      step.status === "error" && "text-foreground",
                    )}>
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Search context card */}
              {(searchContext.roles?.length || searchContext.queries?.length) && (
                <div className="rounded-lg bg-muted/50 p-3 mt-2 space-y-2">
                  {searchContext.resume && (
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Resume:</span>
                      <span className="font-medium">{searchContext.resume}</span>
                      {searchContext.score && <Badge variant="secondary" className="text-[10px]">{searchContext.score}/100</Badge>}
                    </div>
                  )}
                  {searchContext.roles && searchContext.roles.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">Roles:</span>
                      <div className="flex flex-wrap gap-1">
                        {searchContext.roles.map((r, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {searchContext.location && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Location:</span>
                      <span className="font-medium">{searchContext.location}</span>
                    </div>
                  )}
                  {searchContext.skills && searchContext.skills.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">Skills:</span>
                      <div className="flex flex-wrap gap-1">
                        {searchContext.skills.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {searchContext.queries && searchContext.queries.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <Brain className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">Search queries:</span>
                      <div className="flex flex-wrap gap-1">
                        {searchContext.queries.map((q, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-mono">{q}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Autopilot Job Results */}
      {autopilotJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {autopilotRunning ? `Finding jobs... (${autopilotJobs.length} so far)` : `Found ${autopilotJobs.length} Jobs For You`}
            </h2>
            <Link href="/jobs">
              <Button variant="outline" size="sm">
                View All & Filter <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
          {autopilotJobs.slice(0, 10).map((job, i) => (
            <JobCard
              key={`${job.provider}-${job.externalId}-${i}`}
              job={job}
              isSaved={job.dbId ? savedJobIds.has(job.dbId) : false}
              onSave={() => handleSave(job)}
              onUnsave={() => handleUnsave(job)}
              onClick={() => setSelectedJob(job)}
            />
          ))}
          {autopilotJobs.length > 10 && (
            <div className="text-center">
              <Link href="/jobs">
                <Button variant="outline">See all {autopilotJobs.length} results <ArrowRight className="h-3 w-3 ml-1" /></Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Getting Started */}
      {!data.setup.hasResume && autopilotJobs.length === 0 && (
        <Card className="border-primary/30">
          <CardHeader><CardTitle className="text-lg">Getting Started</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {setupSteps.map((step, i) => (
                <Link key={i} href={step.href} className={cn("flex items-center gap-3 rounded-lg p-2 transition-colors", step.done ? "text-muted-foreground" : "hover:bg-accent")}>
                  {step.done ? <CheckCircle className="h-5 w-5 text-foreground shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
                  <step.icon className="h-4 w-4 shrink-0" />
                  <span className={cn("text-sm", step.done && "line-through")}>{step.label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gamification Widget */}
      <GamificationWidget />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resume Score</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {data.resumeScore !== null ? (
              <div className="flex items-center justify-center py-2"><ScoreCircle score={data.resumeScore} /></div>
            ) : (
              <div className="text-center py-4">
                <p className="text-2xl font-bold text-muted-foreground">--</p>
                <Link href="/resume" className="text-xs text-primary hover:underline">Upload & analyze</Link>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jobs Found</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.totalJobsFound}</p>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saved Jobs</CardTitle>
            <Bookmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.savedJobsCount}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(data.statusCounts).map(([status, count]) => (
                <Badge key={status} variant="secondary" className="text-xs">{status}: {count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Searches This Week</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.searchesThisWeek}</p>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Searches</CardTitle>
            <Link href="/jobs"><Button variant="ghost" size="sm">View all <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
          </CardHeader>
          <CardContent>
            {data.recentSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No searches yet</p>
            ) : (
              <div className="space-y-2">
                {data.recentSearches.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{s.query}</p>
                      <p className="text-xs text-muted-foreground">{s.totalResults} results &middot; {new Date(s.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Saved Jobs</CardTitle>
            <Link href="/tracker"><Button variant="ghost" size="sm">Track all <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
          </CardHeader>
          <CardContent>
            {data.recentSaved.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No saved jobs yet</p>
            ) : (
              <div className="space-y-2">
                {data.recentSaved.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{s.job.title}</p>
                      <p className="text-xs text-muted-foreground">{s.job.company}</p>
                    </div>
                    <Badge variant="secondary">{s.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <JobDetailModal
        job={selectedJob}
        open={!!selectedJob}
        onOpenChange={(open) => !open && setSelectedJob(null)}
        isSaved={selectedJob?.dbId ? savedJobIds.has(selectedJob.dbId) : false}
        onSave={() => selectedJob && handleSave(selectedJob)}
        onUnsave={() => selectedJob && handleUnsave(selectedJob)}
      />
    </div>
  );
}
