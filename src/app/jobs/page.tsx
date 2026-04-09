"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { JobCard } from "@/components/jobs/job-card";
import { JobDetailModal } from "@/components/jobs/job-detail-modal";
import { useToast } from "@/components/ui/toast";
import {
  Search, Loader2, SlidersHorizontal, Rocket, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { NormalizedJob, SortOption } from "@/types/jobs";

type ExtendedJob = NormalizedJob & { dbId?: number; savedJobId?: number | null; savedJobStatus?: string | null };

export default function JobsPage() {
  const { toast } = useToast();

  // All jobs from DB
  const [allJobs, setAllJobs] = useState<ExtendedJob[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [totalInDb, setTotalInDb] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

  // New search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchDatePosted, setSearchDatePosted] = useState<string>("1d");
  const [searching, setSearching] = useState(false);
  const [newSearchResults, setNewSearchResults] = useState<ExtendedJob[]>([]);
  const [showNewSearch, setShowNewSearch] = useState(false);
  const [providerResults, setProviderResults] = useState<{ provider: string; count: number; error?: string }[]>([]);

  // Filters (apply to all-jobs view)
  const [filterText, setFilterText] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterRemote, setFilterRemote] = useState<"all" | "remote" | "onsite">("all");
  const [filterSaved, setFilterSaved] = useState<"all" | "saved" | "unsaved">("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showFilters, setShowFilters] = useState(false);

  const [selectedJob, setSelectedJob] = useState<ExtendedJob | null>(null);

  // Load all jobs from DB with server-side filters
  const loadJobs = async (p: number = 1, filters?: {
    company?: string; provider?: string; text?: string; remote?: string; sort?: string;
  }) => {
    setLoadingAll(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "100" });
      const f = filters || {};
      if (f.company || filterCompany) params.set("company", f.company ?? filterCompany);
      if (f.provider || filterProvider) params.set("provider", f.provider ?? filterProvider);
      if (f.text || filterText) params.set("q", f.text ?? filterText);
      const remote = f.remote ?? filterRemote;
      if (remote && remote !== "all") params.set("remote", remote);
      params.set("sort", f.sort ?? sortBy);

      const res = await fetch(`/api/jobs/all?${params}`);
      const data = await res.json();
      setAllJobs(data.jobs || []);
      setTotalInDb(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setAvailableCompanies(data.filters?.companies || []);
      setAvailableProviders(data.filters?.providers || []);
    } catch {
      toast("Failed to load jobs", "error");
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // Reload from server when dropdown filters change (reset to page 1)
  useEffect(() => {
    if (!showNewSearch) {
      loadJobs(1);
    }
  }, [filterCompany, filterProvider, filterRemote, sortBy]);

  // Debounce text filter to avoid API call on every keystroke
  const textDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (showNewSearch) return;
    clearTimeout(textDebounceRef.current);
    textDebounceRef.current = setTimeout(() => loadJobs(1), 300);
    return () => clearTimeout(textDebounceRef.current);
  }, [filterText]);

  // Client-side filtering — only needed for new search results view
  // For "all jobs" view, filtering is done server-side
  const filteredJobs = useMemo(() => {
    if (!showNewSearch) {
      // Server already filtered — only apply saved filter client-side
      let jobs = allJobs;
      if (filterSaved === "saved") {
        jobs = jobs.filter((j) => (j as { savedJobId?: number | null }).savedJobId);
      } else if (filterSaved === "unsaved") {
        jobs = jobs.filter((j) => !(j as { savedJobId?: number | null }).savedJobId);
      }
      return jobs;
    }

    // New search results: filter client-side
    let jobs = newSearchResults;

    if (filterText) {
      const q = filterText.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          (j.location || "").toLowerCase().includes(q) ||
          (j.description || "").toLowerCase().includes(q)
      );
    }

    if (filterCompany) {
      jobs = jobs.filter((j) => j.company === filterCompany);
    }

    if (filterProvider) {
      jobs = jobs.filter((j) => j.provider === filterProvider);
    }

    if (filterRemote === "remote") {
      jobs = jobs.filter((j) => j.isRemote);
    } else if (filterRemote === "onsite") {
      jobs = jobs.filter((j) => !j.isRemote);
    }

    if (filterSaved === "saved") {
      jobs = jobs.filter((j) => (j as { savedJobId?: number | null }).savedJobId);
    } else if (filterSaved === "unsaved") {
      jobs = jobs.filter((j) => !(j as { savedJobId?: number | null }).savedJobId);
    }

    // Sort
    return [...jobs].sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime();
      }
      if (sortBy === "salary") {
        return (b.salaryMin || 0) - (a.salaryMin || 0);
      }
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });
  }, [allJobs, newSearchResults, showNewSearch, filterText, filterCompany, filterProvider, filterRemote, filterSaved, sortBy]);

  const handleNewSearch = async () => {
    if (!searchQuery.trim() && !searchCompany.trim()) {
      toast("Enter a job title or company name", "error");
      return;
    }
    setSearching(true);
    try {
      // If company is specified, include it in the query
      let query = searchQuery.trim();
      if (searchCompany.trim()) {
        query = query
          ? `${query} at ${searchCompany.trim()}`
          : searchCompany.trim();
      }

      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          location: searchLocation.trim() || undefined,
          remote: filterRemote === "remote" ? true : undefined,
          datePosted: searchDatePosted || "1d",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Search failed");
      }
      const data = await res.json();

      let jobs = data.jobs || [];

      // Client-side company filter for exact match when searching by company
      if (searchCompany.trim()) {
        const companyLower = searchCompany.trim().toLowerCase();
        const companyFiltered = jobs.filter((j: ExtendedJob) =>
          j.company.toLowerCase().includes(companyLower)
        );
        // Use filtered if it has results, otherwise keep all (API might have matched differently)
        if (companyFiltered.length > 0) {
          jobs = companyFiltered;
        }
      }

      setNewSearchResults(jobs);
      setProviderResults(data.providerResults || []);
      setShowNewSearch(true);

      const dateLabel = { "1d": "24 hours", "3d": "3 days", "7d": "7 days", "14d": "2 weeks", "30d": "30 days" }[searchDatePosted] || searchDatePosted;
      if (jobs.length > 0) {
        toast(`Found ${jobs.length} jobs from the past ${dateLabel}`, "success");
      } else {
        toast(`No jobs found in the past ${dateLabel}. Try expanding the time range.`, "info");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Search failed", "error");
    } finally {
      setSearching(false);
    }
  };

  const handleBackToAll = () => {
    setShowNewSearch(false);
    setNewSearchResults([]);
    setProviderResults([]);
    loadJobs(page); // Reload to include newly searched jobs
  };

  const handleSave = async (jobId: number) => {
    try {
      const res = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResultId: jobId }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      const updateFn = (j: ExtendedJob) =>
        j.dbId === jobId ? { ...j, savedJobId: saved.id } : j;
      setAllJobs((prev) => prev.map(updateFn));
      setNewSearchResults((prev) => prev.map(updateFn));
      toast("Added to Tracker!", "success", { label: "View Tracker", href: "/tracker" });
    } catch {
      toast("Failed to save", "error");
    }
  };

  const handleUnsave = async (jobId: number) => {
    try {
      await fetch("/api/jobs/save", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResultId: jobId }),
      });
      const updateFn = (j: ExtendedJob) =>
        j.dbId === jobId ? { ...j, savedJobId: null } : j;
      setAllJobs((prev) => prev.map(updateFn));
      setNewSearchResults((prev) => prev.map(updateFn));
    } catch {
      toast("Failed to unsave", "error");
    }
  };

  const handleMarkApplied = async (jobId: number) => {
    try {
      let savedJobId: number | null = null;

      // Find the job to check if it's already saved
      const job = [...allJobs, ...newSearchResults].find((j) => j.dbId === jobId);
      savedJobId = (job as ExtendedJob)?.savedJobId ?? null;

      // If not saved yet, save it first
      if (!savedJobId) {
        const saveRes = await fetch("/api/jobs/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobResultId: jobId }),
        });
        if (!saveRes.ok) throw new Error();
        const saved = await saveRes.json();
        savedJobId = saved.id;
      }

      // Now update status to "applied"
      const res = await fetch(`/api/jobs/save/${savedJobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      });
      if (!res.ok) throw new Error();

      const updateFn = (j: ExtendedJob) =>
        j.dbId === jobId ? { ...j, savedJobId: savedJobId!, savedJobStatus: "applied" } : j;
      setAllJobs((prev) => prev.map(updateFn));
      setNewSearchResults((prev) => prev.map(updateFn));
      if (selectedJob?.dbId === jobId) {
        setSelectedJob((prev) => prev ? { ...prev, savedJobId: savedJobId!, savedJobStatus: "applied" } as ExtendedJob : prev);
      }
      toast("Marked as Applied!", "success", { label: "View Tracker", href: "/tracker" });
    } catch {
      toast("Failed to mark as applied", "error");
    }
  };

  const clearFilters = () => {
    setFilterText("");
    setFilterCompany("");
    setFilterProvider("");
    setFilterRemote("all");
    setFilterSaved("all");
    setSortBy("recent");
  };

  const hasActiveFilters = filterText || filterCompany || filterProvider || filterRemote !== "all" || filterSaved !== "all";

  if (loadingAll) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {showNewSearch ? "Search Results" : "All Jobs"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {showNewSearch
              ? `${newSearchResults.length} results for "${searchQuery}"`
              : `${totalInDb} jobs from all searches`}
          </p>
        </div>
        {showNewSearch && (
          <Button variant="outline" onClick={handleBackToAll}>
            <ChevronLeft className="h-4 w-4" />
            Back to All Jobs
          </Button>
        )}
      </div>

      {/* Search bar for NEW searches */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* Row 1: Keywords + Location */}
          <div className="flex gap-2">
            <Input
              placeholder="Job title or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewSearch()}
              className="flex-1"
            />
            <Input
              placeholder="Location (e.g. India, New York)..."
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewSearch()}
              className="w-48"
            />
            <Button onClick={handleNewSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Search
            </Button>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Row 2: Company + Date Range */}
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Specific company (e.g. Google, Microsoft)..."
              value={searchCompany}
              onChange={(e) => setSearchCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewSearch()}
              className="w-64"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Posted within:</span>
              {[
                { value: "1d", label: "24h" },
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSearchDatePosted(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    searchDatePosted === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider results from new search */}
          {showNewSearch && providerResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {providerResults.map((pr) => (
                <Badge key={pr.provider} variant={pr.error ? "destructive" : "secondary"}>
                  {pr.provider}: {pr.error ? `Error` : `${pr.count}`}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-semibold">Filter & Sort</Label>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                  <X className="h-3 w-3" />
                  Clear all
                </Button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Search in results</Label>
                <Input
                  placeholder="Filter by title, company, location..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Company</Label>
                <Select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
                  <option value="">All companies</option>
                  {availableCompanies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Provider</Label>
                <Select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)}>
                  <option value="">All providers</option>
                  {availableProviders.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Remote</Label>
                <Select value={filterRemote} onChange={(e) => setFilterRemote(e.target.value as typeof filterRemote)}>
                  <option value="all">All</option>
                  <option value="remote">Remote only</option>
                  <option value="onsite">On-site / Hybrid</option>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Saved</Label>
                <Select value={filterSaved} onChange={(e) => setFilterSaved(e.target.value as typeof filterSaved)}>
                  <option value="all">All</option>
                  <option value="saved">Saved only</option>
                  <option value="unsaved">Unsaved only</option>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Sort by</Label>
                <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                  <option value="recent">Most Recent</option>
                  <option value="relevance">Most Relevant</option>
                  <option value="salary">Highest Salary</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick filters: company dropdown + results count */}
      <div className="flex items-center gap-3">
        <Select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
        >
          <option value="">All companies ({availableCompanies.length})</option>
          {availableCompanies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        {filterCompany && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFilterCompany("")}>
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filteredJobs.length} of {totalInDb} {hasActiveFilters ? "filtered" : ""} job{totalInDb !== 1 ? "s" : ""}
        </span>
        {!showNewSearch && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loadingAll}
              onClick={() => loadJobs(page - 1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loadingAll}
              onClick={() => loadJobs(page + 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Job List */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {totalInDb === 0 ? (
              <div>
                <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">No jobs yet</p>
                <p className="text-sm mt-1">Use &ldquo;Find Jobs For Me&rdquo; on the Dashboard or search above.</p>
              </div>
            ) : hasActiveFilters ? (
              <div>
                <p>No jobs match your filters.</p>
                <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
              </div>
            ) : (
              <p>No results for this search.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job, i) => (
            <JobCard
              key={`${job.provider}-${job.externalId}-${i}`}
              job={job}
              isSaved={!!(job as { savedJobId?: number | null }).savedJobId}
              onSave={() => job.dbId && handleSave(job.dbId)}
              onUnsave={() => job.dbId && handleUnsave(job.dbId)}
              onClick={() => setSelectedJob(job)}
            />
          ))}
        </div>
      )}

      <JobDetailModal
        job={selectedJob}
        open={!!selectedJob}
        onOpenChange={(open) => !open && setSelectedJob(null)}
        isSaved={!!(selectedJob as ExtendedJob | null)?.savedJobId}
        isApplied={(selectedJob as ExtendedJob | null)?.savedJobStatus === "applied"}
        onSave={() => selectedJob?.dbId && handleSave(selectedJob.dbId)}
        onUnsave={() => selectedJob?.dbId && handleUnsave(selectedJob.dbId)}
        onMarkApplied={() => selectedJob?.dbId && handleMarkApplied(selectedJob.dbId)}
      />
    </div>
  );
}
