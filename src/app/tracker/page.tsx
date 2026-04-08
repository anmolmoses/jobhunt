"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, Building2, MapPin, Calendar, Clock, ChevronRight,
  AlertCircle, Plus, ExternalLink, TrendingUp, Video, Phone,
  FileText, Users, Briefcase, Target, ArrowRight, Search,
} from "lucide-react";
import Link from "next/link";
import { JobDetailModal } from "@/components/jobs/job-detail-modal";
import type { NormalizedJob } from "@/types/jobs";

interface SavedJob {
  id: number;
  jobResultId: number;
  notes: string | null;
  status: string;
  appliedAt: string | null;
  followUpDate: string | null;
  nextStep: string | null;
  createdAt: string;
  updatedAt: string;
  job: {
    id: number;
    externalId: string | null;
    title: string;
    company: string;
    location: string | null;
    salary: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    description: string | null;
    jobType: string | null;
    isRemote: boolean;
    applyUrl: string | null;
    companyLogo: string | null;
    postedAt: string | null;
    tags: string[];
    provider: string;
    relevanceScore: number | null;
    dedupeKey: string | null;
  };
}

interface Interview {
  id: number;
  savedJobId: number;
  type: string;
  scheduledAt: string | null;
  duration: number | null;
  interviewerName: string | null;
  interviewerTitle: string | null;
  meetingLink: string | null;
  notes: string | null;
  outcome: string;
}

interface Activity {
  id: number;
  savedJobId: number | null;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface TrackerData {
  pipeline: SavedJob[];
  interviews: Interview[];
  activity: Activity[];
  stats: {
    total: number;
    saved?: number;
    applied?: number;
    interviewing?: number;
    offered?: number;
    rejected?: number;
    responseRate: number;
    followUpsDue: number;
    upcomingInterviews: number;
  };
  followUpsDue: SavedJob[];
  upcomingInterviews: Interview[];
}

const PIPELINE_COLUMNS = [
  { key: "saved", label: "Saved", color: "bg-zinc-400 dark:bg-zinc-500", icon: Briefcase },
  { key: "applied", label: "Applied", color: "bg-blue-500 dark:bg-blue-400", icon: Target },
  { key: "interviewing", label: "Interviewing", color: "bg-amber-500 dark:bg-amber-400", icon: Video },
  { key: "offered", label: "Offered", color: "bg-green-500 dark:bg-green-400", icon: TrendingUp },
  { key: "rejected", label: "Rejected", color: "bg-red-400 dark:bg-red-500", icon: AlertCircle },
];

const INTERVIEW_TYPES = [
  { value: "phone_screen", label: "Phone Screen" },
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "system_design", label: "System Design" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "onsite", label: "On-site" },
  { value: "final", label: "Final Round" },
  { value: "other", label: "Other" },
];

export default function TrackerPage() {
  const { toast } = useToast();
  const [data, setData] = useState<TrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pipeline" | "timeline" | "interviews">("pipeline");
  const [interviewModal, setInterviewModal] = useState<number | null>(null); // savedJobId
  const [newInterview, setNewInterview] = useState({ type: "phone_screen", scheduledAt: "", interviewerName: "", meetingLink: "", notes: "" });
  const [selectedJob, setSelectedJob] = useState<(NormalizedJob & { dbId?: number }) | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<number | null>(null);

  const openJobDetail = (item: SavedJob) => {
    setSelectedJob({
      externalId: item.job.externalId || String(item.job.id),
      provider: item.job.provider as NormalizedJob["provider"],
      title: item.job.title,
      company: item.job.company,
      location: item.job.location,
      salary: item.job.salary,
      salaryMin: item.job.salaryMin,
      salaryMax: item.job.salaryMax,
      description: item.job.description,
      jobType: item.job.jobType,
      isRemote: item.job.isRemote,
      applyUrl: item.job.applyUrl,
      companyLogo: item.job.companyLogo,
      postedAt: item.job.postedAt,
      tags: item.job.tags || [],
      relevanceScore: item.job.relevanceScore,
      dedupeKey: item.job.dedupeKey || "",
      dbId: item.job.id,
    });
    setSelectedSavedId(item.id);
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const res = await fetch("/api/tracker");
      setData(await res.json());
    } catch {
      toast("Failed to load tracker", "error");
    } finally {
      setLoading(false);
    }
  };

  const updateJobStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/jobs/save/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadData();
      toast(`Status updated to ${status}`, "success");
    } catch {
      toast("Failed to update", "error");
    }
  };

  const updateJob = async (id: number, updates: Record<string, unknown>) => {
    try {
      await fetch(`/api/jobs/save/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      loadData();
    } catch {
      toast("Failed to update", "error");
    }
  };

  const scheduleInterview = async () => {
    if (!interviewModal) return;
    try {
      await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedJobId: interviewModal, ...newInterview }),
      });
      setInterviewModal(null);
      setNewInterview({ type: "phone_screen", scheduledAt: "", interviewerName: "", meetingLink: "", notes: "" });
      loadData();
      toast("Interview scheduled!", "success");
    } catch {
      toast("Failed to schedule", "error");
    }
  };

  const updateInterviewOutcome = async (id: number, outcome: string) => {
    try {
      await fetch(`/api/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      loadData();
      toast(`Interview marked as ${outcome}`, "success");
    } catch {
      toast("Failed to update", "error");
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { pipeline, stats, followUpsDue, upcomingInterviews, interviews, activity } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Application Tracker</h1>
        <p className="text-muted-foreground mt-1">Your complete job application pipeline</p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-3 md:grid-cols-5">
        {PIPELINE_COLUMNS.map((col) => (
          <Card key={col.key}>
            <CardContent className="py-3 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${col.color} flex items-center justify-center`}>
                <col.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats as Record<string, number>)[col.key] || 0}</p>
                <p className="text-xs text-muted-foreground">{col.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className={followUpsDue.length > 0 ? "border-foreground/20 bg-muted/50" : ""}>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className={`h-5 w-5 ${followUpsDue.length > 0 ? "text-foreground" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-medium">{followUpsDue.length} follow-up{followUpsDue.length !== 1 ? "s" : ""} due</p>
              {followUpsDue.length > 0 && (
                <p className="text-xs text-muted-foreground">{followUpsDue[0].job.company} — {followUpsDue[0].job.title}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={upcomingInterviews.length > 0 ? "border-foreground/20 bg-muted/50" : ""}>
          <CardContent className="py-3 flex items-center gap-3">
            <Video className={`h-5 w-5 ${upcomingInterviews.length > 0 ? "text-foreground" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-medium">{upcomingInterviews.length} upcoming interview{upcomingInterviews.length !== 1 ? "s" : ""}</p>
              {upcomingInterviews.length > 0 && upcomingInterviews[0].scheduledAt && (
                <p className="text-xs text-muted-foreground">{new Date(upcomingInterviews[0].scheduledAt).toLocaleDateString()}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{stats.responseRate}% response rate</p>
              <p className="text-xs text-muted-foreground">{(stats.applied || 0) + (stats.interviewing || 0) + (stats.offered || 0)} applied total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b">
        {[
          { key: "pipeline" as const, label: "Pipeline Board" },
          { key: "interviews" as const, label: `Interviews (${interviews.length})` },
          { key: "timeline" as const, label: "Activity Timeline" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline Board (Kanban) */}
      {activeTab === "pipeline" && (
        <div className="grid gap-4 md:grid-cols-5">
          {PIPELINE_COLUMNS.map((col) => {
            const columnJobs = pipeline.filter((j) => j.status === col.key);
            return (
              <div key={col.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className={`h-2 w-2 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">{columnJobs.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[200px]">
                  {columnJobs.map((item) => (
                    <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openJobDetail(item)}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          {item.job.companyLogo ? (
                            <img src={item.job.companyLogo} alt="" className="h-7 w-7 rounded object-contain border shrink-0" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight truncate">{item.job.title}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{item.job.company}</p>
                          </div>
                        </div>

                        {item.job.location && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" />{item.job.location}
                          </p>
                        )}

                        {item.nextStep && (
                          <p className="text-[10px] text-foreground font-medium flex items-center gap-1">
                            <ArrowRight className="h-2.5 w-2.5" />{item.nextStep}
                          </p>
                        )}

                        {item.followUpDate && (
                          <p className={`text-[10px] flex items-center gap-1 ${item.followUpDate <= new Date().toISOString().split("T")[0] ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            <Clock className="h-2.5 w-2.5" />Follow up: {item.followUpDate}
                          </p>
                        )}

                        {/* Quick actions */}
                        <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                          {col.key === "saved" && (
                            <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => updateJobStatus(item.id, "applied")}>
                              Mark Applied
                            </Button>
                          )}
                          {col.key === "applied" && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setInterviewModal(item.id)}>
                                <Plus className="h-2.5 w-2.5" /> Interview
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => updateJobStatus(item.id, "rejected")}>
                                Reject
                              </Button>
                            </>
                          )}
                          {col.key === "interviewing" && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setInterviewModal(item.id)}>
                                <Plus className="h-2.5 w-2.5" /> Round
                              </Button>
                              <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => updateJobStatus(item.id, "offered")}>
                                Offer
                              </Button>
                            </>
                          )}
                          {item.job.applyUrl && (
                            <a href={item.job.applyUrl} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5">
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {columnJobs.length === 0 && (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      {col.key === "saved" ? (
                        <div className="space-y-2 py-2">
                          <Search className="h-5 w-5 mx-auto text-muted-foreground/50" />
                          <p>No tracked jobs yet</p>
                          <Link href="/jobs">
                            <Button variant="outline" size="sm" className="text-xs h-7">
                              <Plus className="h-3 w-3" />
                              Find Jobs to Track
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <p className="py-2">No jobs</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interviews Tab */}
      {activeTab === "interviews" && (
        <div className="space-y-3">
          {interviews.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Video className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">No interviews scheduled</p>
                <p className="text-sm mt-1">Schedule interviews from the Pipeline Board</p>
              </CardContent>
            </Card>
          ) : (
            interviews.map((interview) => {
              const job = pipeline.find((p) => p.id === interview.savedJobId);
              return (
                <Card key={interview.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">{interview.type.replace("_", " ")}</Badge>
                          {interview.outcome === "pending" && <Badge variant="warning">Pending</Badge>}
                          {interview.outcome === "passed" && <Badge variant="success">Passed</Badge>}
                          {interview.outcome === "failed" && <Badge variant="destructive">Failed</Badge>}
                        </div>
                        {job && (
                          <p className="text-sm font-medium">{job.job.title} at {job.job.company}</p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {interview.scheduledAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(interview.scheduledAt).toLocaleString()}
                            </span>
                          )}
                          {interview.duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />{interview.duration} min
                            </span>
                          )}
                          {interview.interviewerName && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />{interview.interviewerName}
                            </span>
                          )}
                        </div>
                        {interview.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{interview.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {interview.meetingLink && (
                          <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm"><Video className="h-3 w-3" /> Join</Button>
                          </a>
                        )}
                        {interview.outcome === "pending" && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => updateInterviewOutcome(interview.id, "passed")}>Passed</Button>
                            <Button variant="ghost" size="sm" onClick={() => updateInterviewOutcome(interview.id, "failed")}>Failed</Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === "timeline" && (
        <div className="space-y-0">
          {activity.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">No activity yet</p>
                <p className="text-sm mt-1">Activity is logged when you change job statuses, schedule interviews, etc.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              {activity.map((item, i) => {
                const job = pipeline.find((p) => p.id === item.savedJobId);
                const typeColors: Record<string, string> = {
                  applied: "bg-foreground/70",
                  offer_received: "bg-foreground/90",
                  status_change: "bg-foreground/40",
                  interview_scheduled: "bg-foreground/60",
                  interview_passed: "bg-foreground/90",
                  interview_failed: "bg-foreground/30",
                  follow_up_set: "bg-foreground/50",
                  follow_up_due: "bg-foreground/50",
                };
                return (
                  <div key={item.id} className="relative pl-10 pb-6">
                    <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-background ${typeColors[item.type] || "bg-gray-400"}`} />
                    <div className="text-sm">
                      <p className="font-medium">{item.title}</p>
                      {job && (
                        <p className="text-xs text-muted-foreground">{job.job.title} at {job.job.company}</p>
                      )}
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Job Detail Modal */}
      <JobDetailModal
        job={selectedJob}
        open={!!selectedJob}
        onOpenChange={(open) => { if (!open) { setSelectedJob(null); setSelectedSavedId(null); } }}
        isSaved={true}
      />

      {/* Interview Scheduling Modal */}
      <Dialog open={!!interviewModal} onOpenChange={(open) => !open && setInterviewModal(null)}>
        <DialogContent onClose={() => setInterviewModal(null)}>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={newInterview.type} onChange={(e) => setNewInterview((p) => ({ ...p, type: e.target.value }))}>
                  {INTERVIEW_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={newInterview.scheduledAt}
                  onChange={(e) => setNewInterview((p) => ({ ...p, scheduledAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Interviewer Name</Label>
              <Input
                placeholder="e.g. John from Engineering"
                value={newInterview.interviewerName}
                onChange={(e) => setNewInterview((p) => ({ ...p, interviewerName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Meeting Link</Label>
              <Input
                placeholder="https://meet.google.com/..."
                value={newInterview.meetingLink}
                onChange={(e) => setNewInterview((p) => ({ ...p, meetingLink: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Prep notes, topics to cover..."
                value={newInterview.notes}
                onChange={(e) => setNewInterview((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInterviewModal(null)}>Cancel</Button>
              <Button onClick={scheduleInterview}>Schedule Interview</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
