"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, Search, MapPin, Building2, Briefcase, ChevronRight,
  ExternalLink, Bookmark, BookmarkCheck, DollarSign, X,
} from "lucide-react";

const JobMap = dynamic(
  () => import("@/components/map/job-map").then((mod) => mod.JobMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    ),
  }
);

interface MapJob {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  isRemote: boolean;
  applyUrl: string | null;
  companyLogo: string | null;
  postedAt: string | null;
  provider: string;
  latitude: number;
  longitude: number;
  savedJobId: number | null;
}

interface CompanyGroup {
  name: string;
  logo: string | null;
  location: string;
  jobs: MapJob[];
  latitude: number;
  longitude: number;
}

export default function MapPage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<MapJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalJobs, setTotalJobs] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyGroup | null>(null);
  const [highlightedJob, setHighlightedJob] = useState<MapJob | null>(null);
  const [loadingStep, setLoadingStep] = useState("Connecting...");
  const [loadingDetail, setLoadingDetail] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    const eventSource = new EventSource("/api/jobs/map");

    eventSource.addEventListener("step", (e) => {
      const data = JSON.parse(e.data);
      setLoadingStep(data.step);
      setLoadingDetail(data.detail || "");
      if (data.progress != null) setLoadingProgress(data.progress);
    });

    eventSource.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setJobs(data.jobs || []);
      setTotalJobs(data.totalJobs || 0);
      setLoading(false);
      eventSource.close();
    });

    eventSource.addEventListener("error", () => {
      setLoading(false);
      eventSource.close();
    });

    return () => eventSource.close();
  }, []);

  // Group jobs by company
  const companies = useMemo(() => {
    const map = new Map<string, CompanyGroup>();
    for (const job of jobs) {
      const key = job.company.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: job.company,
          logo: job.companyLogo,
          location: job.location,
          jobs: [],
          latitude: job.latitude,
          longitude: job.longitude,
        });
      }
      map.get(key)!.jobs.push(job);
      // Use logo from any job that has one
      if (job.companyLogo && !map.get(key)!.logo) {
        map.get(key)!.logo = job.companyLogo;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.jobs.length - a.jobs.length);
  }, [jobs]);

  // Filtered companies
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.jobs.some(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            j.provider.toLowerCase().includes(q)
        )
    );
  }, [companies, searchQuery]);

  const handleSave = async (jobId: number) => {
    try {
      const res = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResultId: jobId }),
      });
      if (res.ok) {
        const saved = await res.json();
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, savedJobId: saved.id } : j))
        );
        toast("Job saved!", "success");
      }
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
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, savedJobId: null } : j))
      );
    } catch {
      toast("Failed to unsave", "error");
    }
  };

  const handleCompanyClick = (company: CompanyGroup) => {
    setSelectedCompany(company);
    setHighlightedJob(company.jobs[0]);
  };

  const handleMarkerClick = (job: MapJob) => {
    const company = companies.find(
      (c) => c.name.toLowerCase() === job.company.toLowerCase()
    );
    if (company) setSelectedCompany(company);
  };

  const uniqueCompanies = companies.length;
  const totalRoles = jobs.length;

  if (loading) {
    return (
      <div className="fixed inset-0 ml-64 flex items-center justify-center bg-[#0d1117]">
        <div className="flex flex-col items-center gap-4 max-w-md px-6">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          <p className="text-sm text-white font-medium text-center">{loadingStep}</p>
          {loadingDetail && (
            <p className="text-xs text-gray-500">{loadingDetail}</p>
          )}
          <div className="w-64 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-600">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 ml-64 flex bg-[#0d1117]">
      {/* Map — takes up remaining space */}
      <div className="flex-1 relative">
        {/* Stats bar floating on map */}
        <div className="absolute top-4 left-4 z-[1000] flex items-center gap-3 text-sm text-gray-400">
          <span className="font-medium text-white">{uniqueCompanies} companies</span>
          <span className="text-gray-600">|</span>
          <span>{totalRoles} roles</span>
          <span className="text-gray-600">|</span>
          <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MapPin className="h-16 w-16 mb-4 text-gray-700" />
            <p className="text-lg font-medium text-gray-400">No jobs to map yet</p>
            <p className="text-sm mt-1">Run a job search first from the Dashboard</p>
          </div>
        ) : (
          <JobMap
            jobs={jobs}
            highlightedJob={highlightedJob}
            onSave={handleSave}
            onUnsave={handleUnsave}
            onMarkerClick={handleMarkerClick}
          />
        )}
      </div>

      {/* Right sidebar — company list */}
      <div className="w-[400px] border-l border-gray-800 bg-[#111827] flex flex-col shrink-0">
        {/* Sidebar header */}
        <div className="p-5 border-b border-gray-800">
          {selectedCompany ? (
            <div>
              <button
                onClick={() => setSelectedCompany(null)}
                className="text-xs text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
              >
                &larr; All companies
              </button>
              <div className="flex items-center gap-3">
                {selectedCompany.logo ? (
                  <img src={selectedCompany.logo} alt="" className="h-10 w-10 rounded-lg object-contain border border-gray-700" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-gray-500" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedCompany.name}</h2>
                  <p className="text-sm text-gray-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {selectedCompany.location}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-bold text-white">Job Openings Map</h2>
              <p className="text-sm text-gray-400">Tap a company to view details</p>
            </div>
          )}
        </div>

        {/* Search */}
        {!selectedCompany && (
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search companies or roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Company list or company detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedCompany ? (
            /* Company detail — show individual job roles */
            <div className="divide-y divide-gray-800">
              {selectedCompany.jobs.map((job) => (
                <div
                  key={job.id}
                  className="px-5 py-4 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-white text-sm truncate">{job.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </span>
                        {job.salary && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {job.salary}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.isRemote && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/20 text-foreground">Remote</span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-400">{job.provider}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          job.savedJobId ? handleUnsave(job.id) : handleSave(job.id)
                        }
                        className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
                      >
                        {job.savedJobId ? (
                          <BookmarkCheck className="h-4 w-4 text-foreground" />
                        ) : (
                          <Bookmark className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                      {job.applyUrl && (
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 text-gray-500" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Company list */
            <div className="divide-y divide-gray-800">
              {filteredCompanies.map((company) => (
                <button
                  key={company.name}
                  onClick={() => handleCompanyClick(company)}
                  className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors text-left group"
                >
                  {company.logo ? (
                    <img
                      src={company.logo}
                      alt=""
                      className="h-11 w-11 rounded-lg object-contain border border-gray-700 shrink-0 bg-gray-900"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-gray-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white text-sm truncate">
                        {company.name}
                      </p>
                      <span className="text-xs font-medium text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full shrink-0 ml-2">
                        {company.jobs.length} {company.jobs.length === 1 ? "role" : "roles"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {company.location}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {/* Show first 2 job titles as tags */}
                      {company.jobs.slice(0, 2).map((j, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300 truncate max-w-[120px]"
                        >
                          {j.title.length > 18 ? j.title.slice(0, 18) + "..." : j.title}
                        </span>
                      ))}
                      {company.jobs.length > 2 && (
                        <span className="text-[10px] text-gray-500">
                          +{company.jobs.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 shrink-0" />
                </button>
              ))}
              {filteredCompanies.length === 0 && (
                <div className="px-5 py-12 text-center text-gray-500">
                  <Search className="h-8 w-8 mx-auto mb-2 text-gray-700" />
                  <p className="text-sm">No companies match your search</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
