"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Search, Save, Loader2, Plus, X, Settings2,
  FileText, MapPin, Briefcase, Tag, Ban, DollarSign,
} from "lucide-react";
import Link from "next/link";

interface ProviderInfo {
  id: string;
  name: string;
  requiresKey: boolean;
  configured: boolean;
  enabled: boolean;
}

interface Preferences {
  desiredRoles: string[];
  desiredSkills: string[];
  experienceLevel: string[];
  locationPreference: string[];
  preferredLocations: string[];
  employmentType: string[];
  excludeKeywords: string[];
  salaryMin: number | null;
  salaryMax: number | null;
}

interface SearchConfig {
  customQueries: string[];
  enabledProviders: ProviderInfo[];
  datePosted: string;
  resultsPerPage: number;
  maxQueries: number;
  useCustomQueriesOnly: boolean;
  preferences: Preferences | null;
  hasResume: boolean;
  resumeFileName: string | null;
}

const DATE_OPTIONS = [
  { value: "1d", label: "Last 24 hours" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
];

const EXP_LABELS: Record<string, string> = {
  entry: "Entry", mid: "Mid", senior: "Senior", lead: "Lead", executive: "Executive",
};

const LOC_LABELS: Record<string, string> = {
  remote: "Remote", hybrid: "Hybrid", onsite: "Onsite",
};

const TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time", contract: "Contract", part_time: "Part-time",
};

export function SearchConfigSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SearchConfig | null>(null);
  const [newQuery, setNewQuery] = useState("");

  useEffect(() => {
    fetch("/api/search-config")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/search-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customQueries: config.customQueries,
          enabledProviders: config.enabledProviders
            .filter((p) => p.enabled)
            .map((p) => p.id),
          datePosted: config.datePosted,
          resultsPerPage: config.resultsPerPage,
          maxQueries: config.maxQueries,
          useCustomQueriesOnly: config.useCustomQueriesOnly,
        }),
      });
      if (res.ok) {
        toast("Search configuration saved", "success");
      } else {
        toast("Failed to save", "error");
      }
    } catch {
      toast("Failed to save search config", "error");
    } finally {
      setSaving(false);
    }
  };

  const addQuery = () => {
    if (!config || !newQuery.trim()) return;
    setConfig({
      ...config,
      customQueries: [...config.customQueries, newQuery.trim()],
    });
    setNewQuery("");
  };

  const removeQuery = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      customQueries: config.customQueries.filter((_, i) => i !== index),
    });
  };

  const toggleProvider = (id: string) => {
    if (!config) return;
    setConfig({
      ...config,
      enabledProviders: config.enabledProviders.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    });
  };

  if (loading || !config) return null;

  const prefs = config.preferences;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Job Search Configuration
        </CardTitle>
        <CardDescription>
          Control exactly what data is sent to job search providers and how results are fetched
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data Currently Being Used */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Data Used for Search</Label>
            <Link href="/preferences" className="text-xs text-muted-foreground hover:text-foreground underline">
              Edit in Preferences
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            This is what gets sent to providers when you search. Edit these on the Preferences page.
          </p>

          {!prefs ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">No preferences set yet.</p>
              <Link href="/preferences" className="text-sm underline">Set up preferences</Link>
            </div>
          ) : (
            <div className="rounded-lg border p-4 space-y-3">
              {/* Resume */}
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Resume</p>
                  <p className="text-sm">
                    {config.hasResume ? config.resumeFileName : <span className="text-muted-foreground italic">None uploaded</span>}
                  </p>
                </div>
              </div>

              {/* Roles */}
              {prefs.desiredRoles.length > 0 && (
                <div className="flex items-start gap-2">
                  <Briefcase className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Desired Roles</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prefs.desiredRoles.map((r, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Skills */}
              {prefs.desiredSkills.length > 0 && (
                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Skills</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prefs.desiredSkills.slice(0, 15).map((s, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                      {prefs.desiredSkills.length > 15 && (
                        <Badge variant="outline" className="text-xs">+{prefs.desiredSkills.length - 15} more</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Location & Work Style */}
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Location &amp; Work Style</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {prefs.locationPreference.map((l, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{LOC_LABELS[l] || l}</Badge>
                    ))}
                    {prefs.preferredLocations.map((l, i) => (
                      <Badge key={`loc-${i}`} variant="outline" className="text-xs">{l}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Experience & Employment */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <Briefcase className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Experience</p>
                    <p className="text-sm">{prefs.experienceLevel.map((e) => EXP_LABELS[e] || e).join(", ")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Briefcase className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Employment Type</p>
                    <p className="text-sm">{prefs.employmentType.map((e) => TYPE_LABELS[e] || e).join(", ")}</p>
                  </div>
                </div>
              </div>

              {/* Salary */}
              {(prefs.salaryMin || prefs.salaryMax) && (
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Salary Range</p>
                    <p className="text-sm">
                      {prefs.salaryMin ? `$${prefs.salaryMin.toLocaleString()}` : "Any"}
                      {" — "}
                      {prefs.salaryMax ? `$${prefs.salaryMax.toLocaleString()}` : "Any"}
                    </p>
                  </div>
                </div>
              )}

              {/* Exclude */}
              {prefs.excludeKeywords.length > 0 && (
                <div className="flex items-start gap-2">
                  <Ban className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Excluding</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prefs.excludeKeywords.map((k, i) => (
                        <Badge key={i} variant="outline" className="text-xs line-through">{k}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Custom Search Queries */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Search Queries</Label>
          <p className="text-xs text-muted-foreground">
            By default, AI generates queries from your resume. Add your own queries here to control exactly what gets searched.
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant={config.useCustomQueriesOnly ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setConfig({ ...config, useCustomQueriesOnly: !config.useCustomQueriesOnly })}
            >
              {config.useCustomQueriesOnly ? "Custom queries only" : "Custom + AI queries"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {config.useCustomQueriesOnly
                ? "Only your custom queries will be used (AI queries ignored)"
                : "Your custom queries run first, then AI-generated ones"}
            </span>
          </div>

          {config.customQueries.length > 0 && (
            <div className="space-y-1.5">
              {config.customQueries.map((q, i) => (
                <div key={i} className="flex items-center gap-2 rounded border px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{q}</span>
                  <button onClick={() => removeQuery(i)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder='e.g. "Senior Backend Engineer Python"'
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuery()}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={addQuery} disabled={!newQuery.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search Parameters */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Search Defaults</Label>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date Range</Label>
              <Select
                value={config.datePosted}
                onChange={(e) => setConfig({ ...config, datePosted: e.target.value })}
              >
                {DATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Results per Query</Label>
              <Select
                value={String(config.resultsPerPage)}
                onChange={(e) => setConfig({ ...config, resultsPerPage: Number(e.target.value) })}
              >
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Max Queries (Autopilot)</Label>
              <Select
                value={String(config.maxQueries)}
                onChange={(e) => setConfig({ ...config, maxQueries: Number(e.target.value) })}
              >
                <option value="1">1 query</option>
                <option value="2">2 queries</option>
                <option value="3">3 queries</option>
                <option value="5">5 queries</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Providers */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Search Providers</Label>
          <p className="text-xs text-muted-foreground">
            Toggle which providers to query. Disabling providers you don&apos;t need speeds up search.
          </p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            {config.enabledProviders.map((p) => (
              <button
                key={p.id}
                onClick={() => p.configured && toggleProvider(p.id)}
                disabled={!p.configured}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
                  !p.configured
                    ? "opacity-40 cursor-not-allowed border-dashed border-muted"
                    : p.enabled
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "border-border hover:border-foreground/40 hover:bg-muted"
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 border ${
                  !p.configured
                    ? "bg-muted-foreground/30 border-muted-foreground/30"
                    : p.enabled
                    ? "bg-background border-background"
                    : "bg-transparent border-muted-foreground/40"
                }`} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${p.enabled && p.configured ? "text-background" : ""}`}>{p.name}</p>
                  {!p.configured && (
                    <p className="text-[10px] text-muted-foreground">Needs API key</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
