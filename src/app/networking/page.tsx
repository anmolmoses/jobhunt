"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, Users, Send, Link2, Mail, Calendar, MessageSquare,
  Trash2, ExternalLink, Clock, Upload, Search, Building2, UserCheck,
  ArrowUpDown, Filter, Briefcase, CheckCircle, ChevronLeft, ChevronRight,
  Share2,
} from "lucide-react";
import { NetworkMap } from "@/components/networking/network-map";

// ============ Types ============

interface OutreachRecord {
  id: number;
  contactId: number;
  channel: string;
  status: string;
  messageTemplate: string | null;
  notes: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  followUpDate: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: number;
    companyName: string;
    personName: string;
    personTitle: string | null;
    personLinkedin: string | null;
    personEmail: string | null;
    personImageUrl: string | null;
    connectionType: string | null;
    mutualConnections: string;
    introducerName: string | null;
  };
}

interface LinkedInConnection {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  profileUrl: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
  hasMessages: boolean;
  messageCount: number;
  messageDirection: string | null;
  lastMessageDate: string | null;
}

interface LinkedInImportStatus {
  imported: boolean;
  importId?: number;
  fileName?: string;
  connectionsCount?: number;
  messagesCount?: number;
  profileName?: string;
  profileHeadline?: string;
  importedAt?: string;
}

interface CompanyCount {
  company: string;
  count: number;
}

// ============ Constants ============

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned", color: "bg-muted text-muted-foreground" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "replied", label: "Replied", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { value: "no_reply", label: "No Reply", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
  { value: "meeting_scheduled", label: "Meeting Scheduled", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "declined", label: "Declined", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
];

const CHANNEL_ICONS: Record<string, typeof Link2> = {
  linkedin: Link2,
  email: Mail,
  other: MessageSquare,
};

// ============ Main Page ============

export default function NetworkingPage() {
  const [activeTab, setActiveTab] = useState<"linkedin" | "map" | "outreach">("linkedin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Networking</h1>
        <p className="text-muted-foreground mt-1">Your LinkedIn connections and outreach tracking</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        <button
          onClick={() => setActiveTab("linkedin")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "linkedin"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Connections
        </button>
        <button
          onClick={() => setActiveTab("map")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "map"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Share2 className="h-4 w-4" />
          Network Map
        </button>
        <button
          onClick={() => setActiveTab("outreach")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "outreach"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="h-4 w-4" />
          Outreach
        </button>
      </div>

      {activeTab === "linkedin" && <LinkedInTab />}
      {activeTab === "map" && <NetworkMap />}
      {activeTab === "outreach" && <OutreachTab />}
    </div>
  );
}

// ============ LinkedIn Tab ============

function LinkedInTab() {
  const { toast } = useToast();
  const [importStatus, setImportStatus] = useState<LinkedInImportStatus | null>(null);
  const [connections, setConnections] = useState<LinkedInConnection[]>([]);
  const [companies, setCompanies] = useState<CompanyCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [matchSavedJobs, setMatchSavedJobs] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load import status
  useEffect(() => {
    fetch("/api/linkedin/import")
      .then((res) => res.json())
      .then((data) => {
        setImportStatus(data);
        if (data.imported) loadConnections("", "", false, 1);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadConnections = useCallback(
    async (searchVal: string, companyVal: string, matchJobs: boolean, pageVal: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchVal) params.set("search", searchVal);
        if (companyVal) params.set("company", companyVal);
        if (matchJobs) params.set("matchSavedJobs", "true");
        params.set("page", String(pageVal));
        params.set("limit", "50");

        const res = await fetch(`/api/linkedin/connections?${params}`);
        const data = await res.json();
        setConnections(data.connections || []);
        setCompanies(data.companies || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch {
        toast("Failed to load connections", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadConnections(value, companyFilter, matchSavedJobs, 1);
    }, 300);
  };

  const handleCompanyFilter = (value: string) => {
    setCompanyFilter(value);
    setPage(1);
    loadConnections(search, value, matchSavedJobs, 1);
  };

  const handleMatchSavedJobs = () => {
    const next = !matchSavedJobs;
    setMatchSavedJobs(next);
    setPage(1);
    setCompanyFilter("");
    setSearch("");
    loadConnections("", "", next, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadConnections(search, companyFilter, matchSavedJobs, newPage);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/linkedin/import", { method: "POST", body: formData });
      const data = await res.json();

      if (data.error) {
        toast(data.error, "error");
        return;
      }

      toast(`Imported ${data.stats.connections} connections and ${data.stats.conversations} conversations`, "success");
      setImportStatus({
        imported: true,
        importId: data.importId,
        fileName: file.name,
        connectionsCount: data.stats.connections,
        messagesCount: data.stats.conversations,
        profileName: data.stats.profileName,
        profileHeadline: data.stats.profileHeadline,
        importedAt: new Date().toISOString(),
      });
      loadConnections("", "", false, 1);
    } catch {
      toast("Failed to import LinkedIn data", "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClearData = async () => {
    try {
      await fetch("/api/linkedin/import", { method: "DELETE" });
      setImportStatus({ imported: false });
      setConnections([]);
      setCompanies([]);
      setTotal(0);
      toast("LinkedIn data cleared", "success");
    } catch {
      toast("Failed to clear data", "error");
    }
  };

  // No import yet — show upload UI
  if (!importStatus?.imported && !loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center max-w-md mx-auto space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Import LinkedIn Connections</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your LinkedIn data export to see your connections, correlate them with companies you&apos;re applying to, and track outreach.
              </p>
            </div>
            <div className="space-y-2">
              <Button onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? "Importing..." : "Upload LinkedIn Export (.zip)"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".zip" onChange={handleImport} className="hidden" />
              <p className="text-xs text-muted-foreground">
                Go to LinkedIn &rarr; Settings &rarr; Data Privacy &rarr; Get a copy of your data
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Import Status Bar */}
      {importStatus?.imported && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {importStatus.connectionsCount} connections imported
                    {importStatus.profileName && (
                      <span className="text-muted-foreground font-normal"> for {importStatus.profileName}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {importStatus.fileName}
                    {importStatus.importedAt && (
                      <> &middot; Imported {new Date(importStatus.importedAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Re-import
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearData}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <input ref={fileInputRef} type="file" accept=".zip" onChange={handleImport} className="hidden" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, or position..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={companyFilter}
          onChange={(e) => handleCompanyFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All Companies</option>
          {companies.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company} ({c.count})
            </option>
          ))}
        </Select>
        <Button
          variant={matchSavedJobs ? "default" : "outline"}
          size="sm"
          onClick={handleMatchSavedJobs}
          className="whitespace-nowrap"
        >
          <Briefcase className="h-4 w-4" />
          {matchSavedJobs ? "Showing matches" : "Match saved jobs"}
        </Button>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} connection{total !== 1 ? "s" : ""}{matchSavedJobs ? " at companies you're tracking" : ""}</span>
        {totalPages > 1 && (
          <span>Page {page} of {totalPages}</span>
        )}
      </div>

      {/* Connections List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            {matchSavedJobs ? (
              <div>
                <p className="font-medium">No matching connections found</p>
                <p className="text-sm mt-1">None of your connections work at companies you&apos;ve saved jobs from. Save more jobs or import more connections.</p>
              </div>
            ) : search || companyFilter ? (
              <p>No connections match your filters</p>
            ) : (
              <p>No connections imported yet</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => (
            <Card key={conn.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{conn.fullName}</h3>
                      {conn.position && (
                        <p className="text-xs text-muted-foreground truncate">{conn.position}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {conn.company && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {conn.company}
                          </span>
                        )}
                        {conn.connectedOn && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {conn.connectedOn}
                          </span>
                        )}
                        {conn.hasMessages && (
                          <Badge variant="secondary" className="text-xs">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {conn.messageCount} msg{conn.messageCount !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {conn.email && (
                          <Badge variant="outline" className="text-xs">
                            <Mail className="h-3 w-3 mr-1" />
                            Email available
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {conn.profileUrl && (
                      <a href={conn.profileUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="icon" className="h-8 w-8">
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    {conn.email && (
                      <a href={`mailto:${conn.email}`}>
                        <Button variant="outline" size="icon" className="h-8 w-8">
                          <Mail className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============ Outreach Tab ============

function OutreachTab() {
  const { toast } = useToast();
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingNotes, setEditingNotes] = useState<number | null>(null);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const res = await fetch("/api/outreach");
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      toast("Failed to load outreach records", "error");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/outreach/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
      toast(`Status updated to ${status}`, "success");
    } catch {
      toast("Failed to update", "error");
    }
  };

  const updateNotes = async (id: number, notes: string) => {
    try {
      await fetch(`/api/outreach/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, notes } : r))
      );
      setEditingNotes(null);
      toast("Notes updated", "success");
    } catch {
      toast("Failed to update notes", "error");
    }
  };

  const deleteRecord = async (id: number) => {
    try {
      await fetch(`/api/outreach/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast("Outreach record deleted", "success");
    } catch {
      toast("Failed to delete", "error");
    }
  };

  const filtered = filterStatus === "all"
    ? records
    : records.filter((r) => r.status === filterStatus);

  const statusCounts = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{records.length}</p>
            <p className="text-xs text-muted-foreground">Total Outreach</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{statusCounts["sent"] || 0}</p>
            <p className="text-xs text-muted-foreground">Messages Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{statusCounts["replied"] || 0}</p>
            <p className="text-xs text-muted-foreground">Replies Received</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{statusCounts["meeting_scheduled"] || 0}</p>
            <p className="text-xs text-muted-foreground">Meetings Scheduled</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus("all")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            filterStatus === "all" ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
          }`}
        >
          All ({records.length})
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

      {/* Outreach List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            {records.length === 0 ? (
              <div>
                <p className="font-medium">No outreach tracked yet</p>
                <p className="text-sm mt-1">Click &ldquo;Find Contacts&rdquo; on any job to discover people in your network, then track your outreach here.</p>
              </div>
            ) : (
              <p>No outreach with status &ldquo;{filterStatus}&rdquo;</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const ChannelIcon = CHANNEL_ICONS[record.channel] || MessageSquare;
            const mutuals = (() => {
              try { return JSON.parse(record.contact.mutualConnections || "[]"); }
              catch { return []; }
            })();

            return (
              <Card key={record.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {record.contact.personImageUrl ? (
                        <img src={record.contact.personImageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold">{record.contact.personName}</h3>
                        {record.contact.personTitle && (
                          <p className="text-sm text-muted-foreground">{record.contact.personTitle}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          at <span className="font-medium">{record.contact.companyName}</span>
                        </p>

                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ChannelIcon className="h-3 w-3" />
                            via {record.channel}
                          </span>
                          {record.sentAt && (
                            <span className="flex items-center gap-1">
                              <Send className="h-3 w-3" />
                              Sent {new Date(record.sentAt).toLocaleDateString()}
                            </span>
                          )}
                          {record.repliedAt && (
                            <span className="flex items-center gap-1 text-foreground">
                              Replied {new Date(record.repliedAt).toLocaleDateString()}
                            </span>
                          )}
                          {record.contact.introducerName && (
                            <Badge variant="outline" className="text-xs">
                              via {record.contact.introducerName}
                            </Badge>
                          )}
                          {mutuals.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {mutuals.length} mutual{mutuals.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>

                        {/* Notes */}
                        <div className="mt-2">
                          {editingNotes === record.id ? (
                            <div className="flex gap-2">
                              <Textarea
                                defaultValue={record.notes || ""}
                                placeholder="Add notes..."
                                rows={2}
                                className="text-sm"
                                id={`notes-${record.id}`}
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const el = document.getElementById(`notes-${record.id}`) as HTMLTextAreaElement;
                                    updateNotes(record.id, el.value);
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
                              onClick={() => setEditingNotes(record.id)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {record.notes || "Add notes..."}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={record.status}
                        onChange={(e) => updateStatus(record.id, e.target.value)}
                        className="w-40"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </Select>
                      {record.contact.personLinkedin && (
                        <a href={record.contact.personLinkedin} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon">
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteRecord(record.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
