"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Building2,
  Eye,
  EyeOff,
  Scan,
  MapPin,
  Briefcase,
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Bell,
  BellDot,
  Users,
  DollarSign,
  Globe,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Info,
  TrendingUp,
  Calendar,
  Hash,
} from "lucide-react";

interface Portal {
  id: number;
  companyName: string;
  normalizedName: string;
  careersUrl: string;
  apiEndpoint: string | null;
  scanMethod: string;
  category: string | null;
  logoUrl: string | null;
  enabled: boolean;
  titleFilters: string[];
  titleExclusions: string[];
  lastScannedAt: string | null;
  lastScanJobCount: number | null;
  fortuneRank: number | null;
  industry: string | null;
  revenue: string | null;
  employees: string | null;
  hqCity: string | null;
  hqState: string | null;
  website: string | null;
  ceo: string | null;
  founded: string | null;
  publicPrivate: string | null;
  ticker: string | null;
  fundingInfo: string | null;
  createdAt: string;
}

interface ScanResult {
  id: number;
  portalId: number;
  externalId: string | null;
  title: string;
  department: string | null;
  location: string | null;
  applyUrl: string | null;
  description: string | null;
  isRemote: boolean;
  postedAt: string | null;
  dismissed: boolean;
  createdAt: string;
  companyName: string;
  companyCategory: string | null;
  scanMethod: string;
}

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

type SortField = "fortuneRank" | "companyName" | "industry" | "employees" | "revenue" | "lastScannedAt" | "lastScanJobCount";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

export default function PortalsPage() {
  const { toast } = useToast();
  const [portals, setPortals] = useState<Portal[]>([]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState<number | "all" | null>(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

  // UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "enabled" | "disabled" | "scanned" | "unscanned">("all");
  const [filterType, setFilterType] = useState<"all" | "Public" | "Private">("all");
  const [sortField, setSortField] = useState<SortField>("fortuneRank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selectedPortal, setSelectedPortal] = useState<Portal | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Add form
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMethod, setFormMethod] = useState("firecrawl");
  const [formCategory, setFormCategory] = useState("");

  const loadPortals = useCallback(async () => {
    try {
      const res = await fetch("/api/portals");
      const data = await res.json();
      if (data.portals) {
        setPortals(Array.isArray(data.portals) ? data.portals : []);
      } else if (Array.isArray(data)) {
        setPortals(data);
      }
    } catch {
      toast("Failed to load portals", "error");
    }
  }, [toast]);

  const loadResults = useCallback(async () => {
    try {
      const res = await fetch("/api/portals/scan");
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      // Results may not exist yet
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Notifications may not exist yet
    }
  }, []);

  useEffect(() => {
    Promise.all([loadPortals(), loadResults(), loadNotifications()]).finally(() =>
      setLoading(false)
    );
  }, [loadPortals, loadResults, loadNotifications]);

  // Auto-import check
  useEffect(() => {
    if (!loading && portals.length === 0) {
      // No portals — prompt to import
    }
  }, [loading, portals.length]);

  const importCsv = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/portals/seed", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast(data.error, "error");
      } else {
        toast(
          `Imported ${data.added} companies, updated ${data.updated}`,
          "success"
        );
        loadPortals();
        loadNotifications();
      }
    } catch {
      toast("Failed to import companies", "error");
    } finally {
      setImporting(false);
    }
  };

  const addPortal = async () => {
    if (!formName || !formUrl) {
      toast("Company name and careers URL are required", "error");
      return;
    }
    try {
      const res = await fetch("/api/portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formName,
          careersUrl: formUrl,
          scanMethod: formMethod,
          category: formCategory || null,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast(data.error, "error");
      } else {
        toast(`Added ${formName}`, "success");
        setShowAddDialog(false);
        setFormName("");
        setFormUrl("");
        setFormMethod("firecrawl");
        setFormCategory("");
        loadPortals();
      }
    } catch {
      toast("Failed to add portal", "error");
    }
  };

  const deletePortal = async (id: number, name: string) => {
    try {
      await fetch("/api/portals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setPortals((prev) => prev.filter((p) => p.id !== id));
      setResults((prev) => prev.filter((r) => r.portalId !== id));
      if (selectedPortal?.id === id) setSelectedPortal(null);
      toast(`Removed ${name}`, "success");
    } catch {
      toast("Failed to delete portal", "error");
    }
  };

  const togglePortal = async (id: number, enabled: boolean) => {
    try {
      await fetch("/api/portals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      setPortals((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled } : p))
      );
    } catch {
      toast("Failed to update portal", "error");
    }
  };

  const scanPortal = async (id: number) => {
    setScanning(id);
    try {
      const res = await fetch("/api/portals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.error) {
        toast(`Scan failed: ${data.error}`, "error");
      } else {
        toast(`Found ${data.count} jobs at ${data.portal}`, "success");
        loadPortals();
        loadResults();
        loadNotifications();
      }
    } catch {
      toast("Scan failed", "error");
    } finally {
      setScanning(null);
    }
  };

  const scanAll = async () => {
    setScanning("all");
    const enabledPortals = portals.filter((p) => p.enabled);
    setScanProgress({ current: 0, total: enabledPortals.length });

    try {
      const res = await fetch("/api/portals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) {
        toast(`Scan failed: ${data.error}`, "error");
      } else {
        toast(
          `Scanned ${data.scanned} portals, found ${data.totalJobs} jobs`,
          "success"
        );
        loadPortals();
        loadResults();
        loadNotifications();
      }
    } catch {
      toast("Scan failed", "error");
    } finally {
      setScanning(null);
      setScanProgress({ current: 0, total: 0 });
    }
  };

  const dismissResult = async (id: number) => {
    try {
      await fetch("/api/portals/scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dismissed: true }),
      });
      setResults((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast("Failed to dismiss", "error");
    }
  };

  const clearAllResults = async () => {
    try {
      await fetch("/api/portals/scan", { method: "DELETE" });
      setResults([]);
      loadPortals();
      toast("Cleared all scan results", "success");
    } catch {
      toast("Failed to clear results", "error");
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      toast("Failed to mark notifications", "error");
    }
  };

  // Computed values
  const categories = useMemo(
    () =>
      [...new Set(portals.map((p) => p.category).filter(Boolean))] as string[],
    [portals]
  );

  const filteredPortals = useMemo(() => {
    let filtered = portals;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.companyName.toLowerCase().includes(q) ||
          p.industry?.toLowerCase().includes(q) ||
          p.hqCity?.toLowerCase().includes(q) ||
          p.hqState?.toLowerCase().includes(q) ||
          p.ceo?.toLowerCase().includes(q) ||
          p.ticker?.toLowerCase().includes(q)
      );
    }

    // Category
    if (filterCategory !== "all") {
      filtered = filtered.filter((p) => p.category === filterCategory);
    }

    // Status
    if (filterStatus === "enabled") filtered = filtered.filter((p) => p.enabled);
    if (filterStatus === "disabled") filtered = filtered.filter((p) => !p.enabled);
    if (filterStatus === "scanned") filtered = filtered.filter((p) => p.lastScannedAt);
    if (filterStatus === "unscanned") filtered = filtered.filter((p) => !p.lastScannedAt);

    // Type
    if (filterType !== "all") {
      filtered = filtered.filter((p) => p.publicPrivate === filterType);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortField) {
        case "fortuneRank":
          aVal = a.fortuneRank ?? 9999;
          bVal = b.fortuneRank ?? 9999;
          break;
        case "companyName":
          aVal = a.companyName.toLowerCase();
          bVal = b.companyName.toLowerCase();
          break;
        case "industry":
          aVal = a.industry?.toLowerCase() ?? "zzz";
          bVal = b.industry?.toLowerCase() ?? "zzz";
          break;
        case "employees":
          aVal = parseInt((a.employees || "0").replace(/[^0-9]/g, "")) || 0;
          bVal = parseInt((b.employees || "0").replace(/[^0-9]/g, "")) || 0;
          break;
        case "revenue":
          aVal = parseRevenue(a.revenue);
          bVal = parseRevenue(b.revenue);
          break;
        case "lastScannedAt":
          aVal = a.lastScannedAt ?? "";
          bVal = b.lastScannedAt ?? "";
          break;
        case "lastScanJobCount":
          aVal = a.lastScanJobCount ?? 0;
          bVal = b.lastScanJobCount ?? 0;
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [portals, searchQuery, filterCategory, filterStatus, filterType, sortField, sortDir]);

  const totalPages = Math.ceil(filteredPortals.length / PAGE_SIZE);
  const paginatedPortals = filteredPortals.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory, filterStatus, filterType]);

  const stats = useMemo(() => {
    const total = portals.length;
    const enabled = portals.filter((p) => p.enabled).length;
    const scanned = portals.filter((p) => p.lastScannedAt).length;
    const totalJobs = portals.reduce((s, p) => s + (p.lastScanJobCount || 0), 0);
    const publicCount = portals.filter((p) => p.publicPrivate === "Public").length;
    const privateCount = portals.filter((p) => p.publicPrivate === "Private").length;
    return { total, enabled, scanned, totalJobs, publicCount, privateCount };
  }, [portals]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state — prompt import
  if (portals.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full">
          <CardContent className="py-12 text-center">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Company Directory</h2>
            <p className="text-muted-foreground mb-6">
              Import Fortune tech companies to start tracking career pages and
              scanning for jobs.
            </p>
            <Button
              size="lg"
              onClick={importCsv}
              disabled={importing}
              className="gap-2"
            >
              {importing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Download className="h-5 w-5" />
              )}
              {importing ? "Importing..." : "Import Fortune Tech Companies"}
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              ~187 companies from Fortune 500-2000 tech rankings
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Company Directory</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total} companies &middot; {stats.enabled} enabled &middot;{" "}
            {results.length} jobs found
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <div className="relative">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              {unreadCount > 0 ? (
                <BellDot className="h-4 w-4 text-primary" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </Button>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>

          {results.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowResults(!showResults)}
              className="gap-2"
            >
              <Briefcase className="h-4 w-4" />
              {results.length} Jobs
            </Button>
          )}

          <Button
            variant="outline"
            onClick={importCsv}
            disabled={importing}
            className="gap-2"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Re-import
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>

          <Button
            onClick={scanAll}
            disabled={scanning !== null}
            className="gap-2"
          >
            {scanning === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            Scan All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard icon={Building2} label="Companies" value={stats.total} />
        <StatCard icon={CheckCircle2} label="Enabled" value={stats.enabled} color="text-green-500" />
        <StatCard icon={Scan} label="Scanned" value={stats.scanned} color="text-blue-500" />
        <StatCard icon={Briefcase} label="Jobs Found" value={stats.totalJobs} color="text-purple-500" />
        <StatCard icon={Globe} label="Public" value={stats.publicCount} color="text-cyan-500" />
        <StatCard icon={TrendingUp} label="Private" value={stats.privateCount} color="text-amber-500" />
      </div>

      {/* Scan Progress */}
      {scanning === "all" && scanProgress.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Scanning portals...</span>
            <span>
              {scanProgress.current}/{scanProgress.total}
            </span>
          </div>
          <Progress
            value={(scanProgress.current / scanProgress.total) * 100}
            className="h-2"
          />
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies, industries, locations, tickers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={`gap-1 ${showFilters ? "border-primary text-primary" : ""}`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {(filterCategory !== "all" || filterStatus !== "all" || filterType !== "all") && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {[filterCategory !== "all", filterStatus !== "all", filterType !== "all"].filter(Boolean).length}
            </span>
          )}
        </Button>

        <span className="text-sm text-muted-foreground">
          {filteredPortals.length} result{filteredPortals.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Category:</span>
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-8 text-xs w-auto"
            >
              <option value="all">All Categories</option>
              {categories.sort().map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({portals.filter((p) => p.category === cat).length})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="h-8 text-xs w-auto"
            >
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="scanned">Scanned</option>
              <option value="unscanned">Unscanned</option>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Type:</span>
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="h-8 text-xs w-auto"
            >
              <option value="all">All Types</option>
              <option value="Public">Public ({stats.publicCount})</option>
              <option value="Private">Private ({stats.privateCount})</option>
            </Select>
          </div>

          {(filterCategory !== "all" || filterStatus !== "all" || filterType !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterCategory("all");
                setFilterStatus("all");
                setFilterType("all");
              }}
              className="h-8 text-xs"
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}

      {/* Category Pills (quick filter) */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterCategory("all")}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            filterCategory === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-accent text-muted-foreground"
          }`}
        >
          All ({portals.length})
        </button>
        {categories.sort().map((cat) => {
          const catCount = portals.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(filterCategory === cat ? "all" : cat)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-accent text-muted-foreground"
              }`}
            >
              {cat} ({catCount})
            </button>
          );
        })}
      </div>

      {/* Data Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 px-3 py-2.5 text-left">
                  <button
                    onClick={() => toggleSort("fortuneRank")}
                    className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Hash className="h-3 w-3" />
                    <SortIcon field="fortuneRank" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <button
                    onClick={() => toggleSort("companyName")}
                    className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    Company
                    <SortIcon field="companyName" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left hidden lg:table-cell">
                  <button
                    onClick={() => toggleSort("industry")}
                    className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    Industry
                    <SortIcon field="industry" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left hidden xl:table-cell">
                  <button
                    onClick={() => toggleSort("revenue")}
                    className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    Revenue
                    <SortIcon field="revenue" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left hidden xl:table-cell">
                  <button
                    onClick={() => toggleSort("employees")}
                    className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    Employees
                    <SortIcon field="employees" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left hidden md:table-cell">HQ</th>
                <th className="px-3 py-2.5 text-center hidden md:table-cell">Method</th>
                <th className="px-3 py-2.5 text-center">
                  <button
                    onClick={() => toggleSort("lastScanJobCount")}
                    className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground mx-auto"
                  >
                    Jobs
                    <SortIcon field="lastScanJobCount" />
                  </button>
                </th>
                <th className="w-24 px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPortals.map((portal) => (
                <tr
                  key={portal.id}
                  className={`border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer ${
                    !portal.enabled ? "opacity-50" : ""
                  } ${selectedPortal?.id === portal.id ? "bg-muted/50" : ""}`}
                  onClick={() => setSelectedPortal(portal)}
                >
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                    {portal.fortuneRank ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[200px]">
                          {portal.companyName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {portal.ticker && (
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded">
                              {portal.ticker}
                            </span>
                          )}
                          {portal.category && (
                            <span className="text-[10px] text-muted-foreground">
                              {portal.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs hidden lg:table-cell truncate max-w-[180px]">
                    {portal.industry ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono hidden xl:table-cell">
                    {portal.revenue ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono hidden xl:table-cell">
                    {portal.employees ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {portal.hqCity && portal.hqState
                      ? `${portal.hqCity}, ${portal.hqState}`
                      : portal.hqCity || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center hidden md:table-cell">
                    <Badge className={`text-[10px] ${methodColor(portal.scanMethod)}`}>
                      {portal.scanMethod}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-xs">
                    {portal.lastScanJobCount ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div
                      className="flex items-center justify-end gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          togglePortal(portal.id, !portal.enabled)
                        }
                        title={portal.enabled ? "Disable" : "Enable"}
                      >
                        {portal.enabled ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => scanPortal(portal.id)}
                        disabled={scanning !== null}
                        title="Scan"
                      >
                        {scanning === portal.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <a
                        href={portal.careersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Open careers page"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedPortals.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No companies match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filteredPortals.length)} of{" "}
              {filteredPortals.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="icon"
                    className="h-7 w-7 text-xs"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Company Detail Sheet */}
      <Sheet
        open={!!selectedPortal}
        onOpenChange={(open) => !open && setSelectedPortal(null)}
      >
        <SheetContent onClose={() => setSelectedPortal(null)}>
          {selectedPortal && (
            <CompanyDetailSheet
              portal={selectedPortal}
              results={results.filter(
                (r) => r.portalId === selectedPortal.id
              )}
              onScan={() => scanPortal(selectedPortal.id)}
              onToggle={() =>
                togglePortal(selectedPortal.id, !selectedPortal.enabled)
              }
              onDelete={() =>
                deletePortal(selectedPortal.id, selectedPortal.companyName)
              }
              onDismissResult={dismissResult}
              scanning={scanning === selectedPortal.id}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Notifications Dropdown */}
      {showNotifications && (
        <div className="fixed top-16 right-4 z-50 w-96 max-h-[70vh] overflow-y-auto rounded-lg border bg-card shadow-xl">
          <div className="sticky top-0 flex items-center justify-between border-b bg-card p-3">
            <h3 className="font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={markAllNotificationsRead}
                >
                  Mark all read
                </Button>
              )}
              <button onClick={() => setShowNotifications(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 text-sm ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {n.type === "new_jobs" ? (
                      <Briefcase className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    ) : n.type === "scan_error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scan Results Panel */}
      {showResults && results.length > 0 && (
        <div className="fixed inset-0 z-40" onClick={() => setShowResults(false)}>
          <div className="fixed inset-0 bg-black/50" />
          <div
            className="fixed bottom-0 left-64 right-0 z-50 max-h-[60vh] overflow-y-auto rounded-t-xl border-t bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b bg-card p-4">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">Scan Results</h3>
                <Badge variant="secondary">{results.length} jobs</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllResults}
                  className="text-destructive hover:text-destructive text-xs"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
                <button onClick={() => setShowResults(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="divide-y">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{result.title}</span>
                      {result.isRemote && (
                        <Badge className="bg-muted text-foreground text-[10px]">
                          Remote
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {result.companyName}
                      </span>
                      {result.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {result.location}
                        </span>
                      )}
                      {result.department && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {result.department}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {result.applyUrl && (
                      <a
                        href={result.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => dismissResult(result.id)}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Company Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent onClose={() => setShowAddDialog(false)}>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Company Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Anthropic"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Careers URL</label>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="e.g. https://www.anthropic.com/careers"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Scan Method</label>
              <Select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value)}
                className="mt-1"
              >
                <option value="firecrawl">Firecrawl (scrape)</option>
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Input
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g. AI & ML"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={addPortal}>Add Company</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Helper Components ---

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Icon className={`h-5 w-5 ${color || "text-muted-foreground"}`} />
      <div>
        <p className="text-lg font-bold leading-none">{value.toLocaleString()}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function CompanyDetailSheet({
  portal,
  results,
  onScan,
  onToggle,
  onDelete,
  onDismissResult,
  scanning,
}: {
  portal: Portal;
  results: ScanResult[];
  onScan: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onDismissResult: (id: number) => void;
  scanning: boolean;
}) {
  return (
    <div className="space-y-6">
      <SheetHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg">
            {portal.companyName.charAt(0)}
          </div>
          <div>
            <SheetTitle>{portal.companyName}</SheetTitle>
            <div className="flex items-center gap-2 mt-1">
              {portal.ticker && (
                <Badge className="bg-muted text-foreground text-[10px] font-mono">
                  {portal.ticker}
                </Badge>
              )}
              {portal.category && (
                <Badge variant="outline" className="text-[10px]">
                  {portal.category}
                </Badge>
              )}
              {portal.publicPrivate && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    portal.publicPrivate === "Public"
                      ? "border-green-500/50 text-green-600"
                      : "border-amber-500/50 text-amber-600"
                  }`}
                >
                  {portal.publicPrivate}
                </Badge>
              )}
              <Badge className={`text-[10px] ${methodColor(portal.scanMethod)}`}>
                {portal.scanMethod}
              </Badge>
            </div>
          </div>
        </div>
      </SheetHeader>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onScan}
          disabled={scanning}
          className="gap-1"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Scan Jobs
        </Button>
        <Button variant="outline" size="sm" onClick={onToggle} className="gap-1">
          {portal.enabled ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {portal.enabled ? "Disable" : "Enable"}
        </Button>
        <a href={portal.careersUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1">
            <ExternalLink className="h-3.5 w-3.5" />
            Careers
          </Button>
        </a>
        {portal.website && (
          <a href={portal.website} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1">
              <Globe className="h-3.5 w-3.5" />
              Website
            </Button>
          </a>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive ml-auto gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
      </div>

      {/* Company Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        {portal.fortuneRank && (
          <InfoItem icon={Hash} label="Fortune Rank" value={`#${portal.fortuneRank}`} />
        )}
        {portal.industry && (
          <InfoItem icon={Briefcase} label="Industry" value={portal.industry} />
        )}
        {portal.revenue && (
          <InfoItem icon={DollarSign} label="Revenue" value={portal.revenue} />
        )}
        {portal.employees && (
          <InfoItem icon={Users} label="Employees" value={portal.employees} />
        )}
        {(portal.hqCity || portal.hqState) && (
          <InfoItem
            icon={MapPin}
            label="Headquarters"
            value={
              portal.hqCity && portal.hqState
                ? `${portal.hqCity}, ${portal.hqState}`
                : portal.hqCity || portal.hqState || ""
            }
          />
        )}
        {portal.ceo && <InfoItem icon={Users} label="CEO" value={portal.ceo} />}
        {portal.founded && (
          <InfoItem icon={Calendar} label="Founded" value={portal.founded} />
        )}
        {portal.fundingInfo && (
          <InfoItem icon={TrendingUp} label="Funding" value={portal.fundingInfo} />
        )}
      </div>

      {/* Scan Status */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-medium mb-2">Scan Status</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Last Scanned</span>
            <p className="font-medium">
              {portal.lastScannedAt
                ? new Date(portal.lastScannedAt).toLocaleDateString()
                : "Never"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Jobs Found</span>
            <p className="font-medium">{portal.lastScanJobCount ?? 0}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Scan Method</span>
            <p className="font-medium capitalize">{portal.scanMethod}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Status</span>
            <p className={`font-medium ${portal.enabled ? "text-green-600" : "text-muted-foreground"}`}>
              {portal.enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
      </div>

      {/* Jobs from this portal */}
      {results.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Jobs ({results.length})
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {results.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {r.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {r.location}
                      </span>
                    )}
                    {r.department && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {r.department}
                      </span>
                    )}
                    {r.isRemote && (
                      <Badge className="bg-muted text-foreground text-[10px]">
                        Remote
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.applyUrl && (
                    <a
                      href={r.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="icon" className="h-7 w-7">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDismissResult(r.id)}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border p-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// --- Helpers ---

function methodColor(method: string): string {
  switch (method) {
    case "greenhouse":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "lever":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "firecrawl":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "bg-muted text-foreground";
  }
}

function parseRevenue(rev: string | null): number {
  if (!rev) return 0;
  const cleaned = rev.replace(/[^0-9.BMK+]/g, "");
  const num = parseFloat(cleaned) || 0;
  if (rev.includes("B")) return num * 1_000_000_000;
  if (rev.includes("M")) return num * 1_000_000;
  if (rev.includes("K")) return num * 1_000;
  return num;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
