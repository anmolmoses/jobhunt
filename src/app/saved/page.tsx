"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  Loader2,
  ExternalLink,
  Trash2,
  MapPin,
  DollarSign,
  Calendar,
  Building2,
  Bookmark,
} from "lucide-react";
import type { JobStatus } from "@/types/jobs";

interface SavedJob {
  id: number;
  jobResultId: number;
  notes: string | null;
  status: string;
  appliedAt: string | null;
  createdAt: string;
  job: {
    title: string;
    company: string;
    location: string | null;
    salary: string | null;
    isRemote: boolean;
    applyUrl: string | null;
    companyLogo: string | null;
    postedAt: string | null;
    provider: string;
    tags: string[];
  };
}

const STATUS_OPTIONS: { value: JobStatus; label: string; color: string }[] = [
  { value: "saved", label: "Saved", color: "bg-muted text-foreground" },
  { value: "applied", label: "Applied", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "interviewing", label: "Interviewing", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "offered", label: "Offered", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
];

export default function SavedJobsPage() {
  const { toast } = useToast();
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingNotes, setEditingNotes] = useState<number | null>(null);

  useEffect(() => {
    loadSavedJobs();
  }, []);

  const loadSavedJobs = async () => {
    try {
      const res = await fetch("/api/jobs/save");
      const data = await res.json();
      setSavedJobs(Array.isArray(data) ? data : []);
    } catch {
      toast("Failed to load saved jobs", "error");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/jobs/save/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSavedJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status } : j))
      );
      toast(`Status updated to ${status}`, "success");
    } catch {
      toast("Failed to update status", "error");
    }
  };

  const updateNotes = async (id: number, notes: string) => {
    try {
      await fetch(`/api/jobs/save/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setSavedJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, notes } : j))
      );
      setEditingNotes(null);
      toast("Notes updated", "success");
    } catch {
      toast("Failed to update notes", "error");
    }
  };

  const removeJob = async (jobResultId: number) => {
    try {
      await fetch("/api/jobs/save", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResultId }),
      });
      setSavedJobs((prev) => prev.filter((j) => j.jobResultId !== jobResultId));
      toast("Job removed", "success");
    } catch {
      toast("Failed to remove job", "error");
    }
  };

  const filteredJobs =
    filterStatus === "all"
      ? savedJobs
      : savedJobs.filter((j) => j.status === filterStatus);

  const statusCounts = savedJobs.reduce(
    (acc, j) => {
      acc[j.status] = (acc[j.status] || 0) + 1;
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
      <div>
        <h1 className="text-3xl font-bold">Saved Jobs</h1>
        <p className="text-muted-foreground mt-1">Track your job applications</p>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus("all")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            filterStatus === "all" ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
          }`}
        >
          All ({savedJobs.length})
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filterStatus === s.value ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
            }`}
          >
            {s.label} ({statusCounts[s.value] || 0})
          </button>
        ))}
      </div>

      {/* Job List */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {savedJobs.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <Bookmark className="h-12 w-12 text-muted-foreground/50" />
                <p>No saved jobs yet. Search for jobs and save the ones you like!</p>
              </div>
            ) : (
              <p>No jobs with status &ldquo;{filterStatus}&rdquo;</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((saved) => (
            <Card key={saved.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {saved.job.companyLogo ? (
                      <img
                        src={saved.job.companyLogo}
                        alt={saved.job.company}
                        className="h-10 w-10 rounded-lg object-contain border"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold">{saved.job.title}</h3>
                      <p className="text-sm text-muted-foreground">{saved.job.company}</p>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {saved.job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {saved.job.location}
                          </span>
                        )}
                        {saved.job.salary && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {saved.job.salary}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Saved {new Date(saved.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Inline Notes */}
                      <div className="mt-2">
                        {editingNotes === saved.id ? (
                          <div className="flex gap-2">
                            <Textarea
                              defaultValue={saved.notes || ""}
                              placeholder="Add notes..."
                              rows={2}
                              className="text-sm"
                              id={`notes-${saved.id}`}
                            />
                            <div className="flex flex-col gap-1">
                              <Button
                                size="sm"
                                onClick={() => {
                                  const el = document.getElementById(`notes-${saved.id}`) as HTMLTextAreaElement;
                                  updateNotes(saved.id, el.value);
                                }}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingNotes(saved.id)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {saved.notes || "Add notes..."}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={saved.status}
                      onChange={(e) => updateStatus(saved.id, e.target.value)}
                      className="w-36"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                    {saved.job.applyUrl && (
                      <a href={saved.job.applyUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="icon">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeJob(saved.jobResultId)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
