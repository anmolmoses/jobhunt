"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Building2,
  Clock,
  Eye,
  EyeOff,
  Scan,
  Sprout,
  MapPin,
  Briefcase,
  X,
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

export default function PortalsPage() {
  const { toast } = useToast();
  const [portals, setPortals] = useState<Portal[]>([]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<number | "all" | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Add form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMethod, setFormMethod] = useState("greenhouse");
  const [formCategory, setFormCategory] = useState("");
  const [formApiEndpoint, setFormApiEndpoint] = useState("");

  const loadPortals = useCallback(async () => {
    try {
      const res = await fetch("/api/portals");
      const data = await res.json();
      setPortals(Array.isArray(data) ? data : []);
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

  useEffect(() => {
    Promise.all([loadPortals(), loadResults()]).finally(() => setLoading(false));
  }, [loadPortals, loadResults]);

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/portals/seed", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast(data.error, "error");
      } else {
        toast(`Seeded ${data.added} companies (${data.skipped} already existed)`, "success");
        loadPortals();
      }
    } catch {
      toast("Failed to seed portals", "error");
    } finally {
      setSeeding(false);
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
          apiEndpoint: formApiEndpoint || null,
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
        setFormMethod("greenhouse");
        setFormCategory("");
        setFormApiEndpoint("");
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
      }
    } catch {
      toast("Scan failed", "error");
    } finally {
      setScanning(null);
    }
  };

  const scanAll = async () => {
    setScanning("all");
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
        toast(`Scanned ${data.scanned} portals, found ${data.totalJobs} jobs`, "success");
        loadPortals();
        loadResults();
      }
    } catch {
      toast("Scan failed", "error");
    } finally {
      setScanning(null);
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

  const categories = [...new Set(portals.map((p) => p.category).filter(Boolean))] as string[];
  const filteredPortals =
    filterCategory === "all"
      ? portals
      : portals.filter((p) => p.category === filterCategory);

  const methodColor = (method: string) => {
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Company Portals</h1>
          <p className="text-muted-foreground mt-1">
            Track and scan company career pages for job openings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={seedDefaults}
            disabled={seeding}
          >
            {seeding ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sprout className="h-4 w-4 mr-2" />
            )}
            Seed Defaults
          </Button>
          <Button variant="outline" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
          <Button
            onClick={scanAll}
            disabled={scanning !== null}
          >
            {scanning === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Scan className="h-4 w-4 mr-2" />
            )}
            Scan All
          </Button>
        </div>
      </div>

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory("all")}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filterCategory === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            }`}
          >
            All ({portals.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                filterCategory === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-accent"
              }`}
            >
              {cat} ({portals.filter((p) => p.category === cat).length})
            </button>
          ))}
        </div>
      )}

      {/* Portal Cards Grid */}
      {filteredPortals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
              <p>No company portals yet. Seed defaults or add one manually.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPortals.map((portal) => (
            <Card
              key={portal.id}
              className={!portal.enabled ? "opacity-60" : undefined}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{portal.companyName}</h3>
                      <Badge className={methodColor(portal.scanMethod)}>
                        {portal.scanMethod}
                      </Badge>
                    </div>
                    {portal.category && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {portal.category}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePortal(portal.id, !portal.enabled)}
                      title={portal.enabled ? "Disable" : "Enable"}
                    >
                      {portal.enabled ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePortal(portal.id, portal.companyName)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  {portal.lastScannedAt ? (
                    <>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(portal.lastScannedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {portal.lastScanJobCount ?? 0} jobs
                      </span>
                    </>
                  ) : (
                    <span>Never scanned</span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => scanPortal(portal.id)}
                    disabled={scanning !== null}
                    className="flex-1"
                  >
                    {scanning === portal.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Scan
                  </Button>
                  <a
                    href={portal.careersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Scan Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Scan Results</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {results.length} jobs found
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllResults}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {results.map((result) => (
              <Card key={result.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{result.title}</h3>
                        {result.isRemote && (
                          <Badge className="bg-muted text-foreground text-xs">
                            Remote
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                          <Button variant="outline" size="icon">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => dismissResult(result.id)}
                        title="Dismiss"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Add Company Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent onClose={() => setShowAddDialog(false)}>
          <DialogHeader>
            <DialogTitle>Add Company Portal</DialogTitle>
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
                placeholder="e.g. https://boards.greenhouse.io/anthropic"
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
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="firecrawl">Firecrawl (scrape)</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Category (optional)</label>
              <Input
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g. AI Labs"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">API Endpoint (optional)</label>
              <Input
                value={formApiEndpoint}
                onChange={(e) => setFormApiEndpoint(e.target.value)}
                placeholder="e.g. https://boards-api.greenhouse.io/v1/boards/anthropic/jobs"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={addPortal}>
                Add Portal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
