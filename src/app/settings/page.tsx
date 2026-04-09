"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Save, TestTube, Loader2, Trash2, AlertTriangle, Clock, Play, CheckCircle, XCircle, Timer, MapPin, RefreshCw } from "lucide-react";
import { GamificationSettings } from "@/components/settings/gamification-settings";
import { SearchConfigSettings } from "@/components/settings/search-config";

const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (latest)" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast)" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (legacy)" },
];

const OPENAI_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4 (frontier)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (fast)" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (cheapest)" },
  { id: "gpt-4.1", label: "GPT-4.1 (1M context)" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { id: "gpt-4o", label: "GPT-4o (legacy)" },
  { id: "o3", label: "o3 (reasoning)" },
  { id: "o4-mini", label: "o4-mini (reasoning, fast)" },
  { id: "o3-mini", label: "o3-mini (reasoning, cheap)" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [envSources, setEnvSources] = useState<Set<string>>(new Set());
  const [geocodeProgress, setGeocodeProgress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [logoProgress, setLogoProgress] = useState<string | null>(null);
  const [refreshingLogos, setRefreshingLogos] = useState(false);

  const [settings, setSettings] = useState({
    ai_provider: "claude",
    claude_model: "claude-sonnet-4-6",
    openai_model: "gpt-4o",
    anthropic_api_key: "",
    openai_api_key: "",
    jsearch_api_key: "",
    adzuna_app_id: "",
    adzuna_app_key: "",
    adzuna_country: "us",
    happenstance_api_key: "",
    happenstance_enabled: "true",
    logodev_api_key: "",
    firecrawl_api_url: "",
    firecrawl_api_key: "",
  });

  // Track which fields user has actually edited (don't send masked values)
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        // Detect env-sourced fields
        const envKeys = new Set<string>();
        for (const [key, value] of Object.entries(data)) {
          if (key.endsWith("_source") && value === "env") {
            envKeys.add(key.replace("_source", ""));
          }
        }
        setEnvSources(envKeys);

        // Remove source keys before setting state
        const cleaned: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
          if (!key.endsWith("_source")) {
            cleaned[key] = value as string;
          }
        }

        setSettings((prev) => ({ ...prev, ...cleaned }));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const updateField = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirtyFields((prev) => new Set(prev).add(key));
  };

  const handleProviderChange = (provider: string) => {
    updateField("ai_provider", provider);
  };

  const currentModels = settings.ai_provider === "claude" ? CLAUDE_MODELS : OPENAI_MODELS;
  const currentModelKey = settings.ai_provider === "claude" ? "claude_model" : "openai_model";
  const currentModelValue = settings.ai_provider === "claude" ? settings.claude_model : settings.openai_model;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send fields that were actually changed
      const payload: Record<string, string> = {};
      for (const key of dirtyFields) {
        payload[key] = settings[key as keyof typeof settings];
      }

      // Always include non-sensitive settings
      payload.ai_provider = settings.ai_provider;
      payload.claude_model = settings.claude_model;
      payload.openai_model = settings.openai_model;
      payload.adzuna_country = settings.adzuna_country;
      payload.happenstance_enabled = settings.happenstance_enabled;
      if (settings.firecrawl_api_url) payload.firecrawl_api_url = settings.firecrawl_api_url;

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast("Settings saved successfully", "success");
      setDirtyFields(new Set());
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (provider: string) => {
    setTesting(provider);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`${provider} connection successful!`, "success");
      } else {
        toast(data.error || `${provider} connection failed`, "error");
      }
    } catch {
      toast(`Failed to test ${provider} connection`, "error");
    } finally {
      setTesting(null);
    }
  };

  const handleUpdateMapCoordinates = async (force: boolean) => {
    setGeocoding(true);
    setGeocodeProgress("Starting...");
    try {
      const res = await fetch(`/api/jobs/geocode${force ? "?force=true" : ""}`, { method: "POST" });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.step) setGeocodeProgress(`${data.step}${data.detail ? ` (${data.detail})` : ""}`);
              if (data.total !== undefined && data.success !== undefined) {
                toast(`Map updated: ${data.success}/${data.total} locations geocoded`, "success");
              }
              if (data.error) toast(data.error, "error");
            } catch { /* skip malformed events */ }
          }
        }
      }
    } catch {
      toast("Failed to update map coordinates", "error");
    } finally {
      setGeocoding(false);
      setGeocodeProgress(null);
    }
  };

  const handleRefreshLogos = async (force: boolean) => {
    setRefreshingLogos(true);
    setLogoProgress("Starting...");
    try {
      const res = await fetch(`/api/jobs/logos${force ? "?force=true" : ""}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to refresh logos", "error");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.step) setLogoProgress(`${data.step}${data.detail ? ` (${data.detail})` : ""}`);
              if (data.done) {
                toast(`Logos updated: ${data.updated}/${data.total} companies`, "success");
              }
              if (data.error) toast(data.error, "error");
            } catch { /* skip malformed events */ }
          }
        }
      }
    } catch {
      toast("Failed to refresh logos", "error");
    } finally {
      setRefreshingLogos(false);
      setLogoProgress(null);
    }
  };

  const EnvBadge = ({ field }: { field: string }) =>
    envSources.has(field) ? (
      <Badge variant="secondary" className="ml-2 text-xs">from .env</Badge>
    ) : null;

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
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your API keys and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>Choose which AI provider and model to use for resume analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={settings.ai_provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={currentModelValue}
                onChange={(e) => updateField(currentModelKey, e.target.value)}
              >
                {currentModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Anthropic API Key
              <EnvBadge field="anthropic_api_key" />
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={settings.anthropic_api_key}
                onChange={(e) => updateField("anthropic_api_key", e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest("claude")}
                disabled={testing === "claude"}
              >
                {testing === "claude" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                Test
              </Button>
            </div>
            {envSources.has("anthropic_api_key") && (
              <p className="text-xs text-muted-foreground">Loaded from ANTHROPIC_API_KEY environment variable</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              OpenAI API Key
              <EnvBadge field="openai_api_key" />
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={settings.openai_api_key}
                onChange={(e) => updateField("openai_api_key", e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest("openai")}
                disabled={testing === "openai"}
              >
                {testing === "openai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                Test
              </Button>
            </div>
            {envSources.has("openai_api_key") && (
              <p className="text-xs text-muted-foreground">Loaded from OPENAI_API_KEY environment variable</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job Search Providers</CardTitle>
          <CardDescription>Configure API keys for job search providers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              JSearch API Key (RapidAPI)
              <EnvBadge field="jsearch_api_key" />
            </Label>
            <Input
              type="password"
              placeholder="RapidAPI key..."
              value={settings.jsearch_api_key}
              onChange={(e) => updateField("jsearch_api_key", e.target.value)}
            />
            {envSources.has("jsearch_api_key") ? (
              <p className="text-xs text-muted-foreground">Loaded from JSEARCH_API_KEY environment variable</p>
            ) : (
              <p className="text-xs text-muted-foreground">200 requests/month free tier. Get from rapidapi.com</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Adzuna App ID
              <EnvBadge field="adzuna_app_id" />
            </Label>
            <Input
              placeholder="App ID..."
              value={settings.adzuna_app_id}
              onChange={(e) => updateField("adzuna_app_id", e.target.value)}
            />
            {envSources.has("adzuna_app_id") && (
              <p className="text-xs text-muted-foreground">Loaded from ADZUNA_APP_ID environment variable</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Adzuna App Key
              <EnvBadge field="adzuna_app_key" />
            </Label>
            <Input
              type="password"
              placeholder="App Key..."
              value={settings.adzuna_app_key}
              onChange={(e) => updateField("adzuna_app_key", e.target.value)}
            />
            {envSources.has("adzuna_app_key") ? (
              <p className="text-xs text-muted-foreground">Loaded from ADZUNA_APP_KEY environment variable</p>
            ) : (
              <p className="text-xs text-muted-foreground">250 requests/day free tier. Get from developer.adzuna.com</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Adzuna Default Country</Label>
            <Select
              value={settings.adzuna_country}
              onChange={(e) => updateField("adzuna_country", e.target.value)}
            >
              <option value="us">United States</option>
              <option value="gb">United Kingdom</option>
              <option value="ca">Canada</option>
              <option value="au">Australia</option>
              <option value="de">Germany</option>
              <option value="fr">France</option>
              <option value="in">India</option>
            </Select>
          </div>

          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-sm font-medium">Remotive</p>
            <p className="text-xs text-muted-foreground">Always enabled — no API key required. Free remote job listings.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Networking</CardTitle>
          <CardDescription>Find connections at companies you&apos;re interested in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/50 space-y-1">
            <p className="text-sm font-medium">LinkedIn Import</p>
            <p className="text-xs text-muted-foreground">
              Always available. Import your LinkedIn data export (.zip) in the Networking tab to see your connections and match them with companies you&apos;re applying to.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Happenstance Contact Discovery</p>
              <p className="text-xs text-muted-foreground">
                {settings.happenstance_enabled === "true"
                  ? "Enabled — Find Contacts button appears on job details"
                  : "Disabled — only LinkedIn connections are shown"}
              </p>
            </div>
            <Button
              variant={settings.happenstance_enabled === "true" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                updateField(
                  "happenstance_enabled",
                  settings.happenstance_enabled === "true" ? "false" : "true"
                )
              }
            >
              {settings.happenstance_enabled === "true" ? "Enabled" : "Disabled"}
            </Button>
          </div>

          {settings.happenstance_enabled === "true" && (
            <div className="space-y-2">
              <Label>
                Happenstance API Key
                <EnvBadge field="happenstance_api_key" />
              </Label>
              <Input
                type="password"
                placeholder="Bearer token from developer.happenstance.ai..."
                value={settings.happenstance_api_key}
                onChange={(e) => updateField("happenstance_api_key", e.target.value)}
              />
              {envSources.has("happenstance_api_key") ? (
                <p className="text-xs text-muted-foreground">Loaded from HAPPENSTANCE_API_KEY environment variable</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Find contacts at companies via your network. Get API key from developer.happenstance.ai
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Logo.dev API Key
              <EnvBadge field="logodev_api_key" />
            </Label>
            <Input
              type="password"
              placeholder="pk_..."
              value={settings.logodev_api_key}
              onChange={(e) => updateField("logodev_api_key", e.target.value)}
            />
            {envSources.has("logodev_api_key") ? (
              <p className="text-xs text-muted-foreground">Loaded from LOGODEV_API_KEY environment variable</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Company logos for jobs without logos. 500K req/month free. Get key from logo.dev
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4" />
                Refresh Company Logos
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fetch logos via Logo.dev for all companies in your job results.
                Fix missing or broken logos.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={refreshingLogos || (!settings.logodev_api_key && !envSources.has("logodev_api_key"))}
                onClick={() => handleRefreshLogos(false)}
              >
                {refreshingLogos ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Fix Broken &amp; Missing
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={refreshingLogos || (!settings.logodev_api_key && !envSources.has("logodev_api_key"))}
                onClick={() => handleRefreshLogos(true)}
              >
                {refreshingLogos ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh All Logos
              </Button>
            </div>
            {logoProgress && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {logoProgress}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Web Scraping (Firecrawl)</CardTitle>
          <CardDescription>
            Self-host Firecrawl via Docker for richer company data, full job descriptions, and accurate office locations.
            Enhances Company Intelligence, Resume Tailoring, and Job Map accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              Firecrawl Instance URL
              <EnvBadge field="firecrawl_api_url" />
            </Label>
            <Input
              placeholder="http://localhost:3002"
              value={settings.firecrawl_api_url}
              onChange={(e) => updateField("firecrawl_api_url", e.target.value)}
            />
            {envSources.has("firecrawl_api_url") ? (
              <p className="text-xs text-muted-foreground">Loaded from FIRECRAWL_API_URL environment variable</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                URL of your self-hosted Firecrawl instance. Run via Docker:{" "}
                <code className="text-xs bg-muted px-1 rounded">docker run -p 3002:3002 mendableai/firecrawl</code>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Firecrawl API Key <span className="text-muted-foreground font-normal">(optional for self-hosted)</span>
              <EnvBadge field="firecrawl_api_key" />
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="fc-... (leave empty if auth disabled)"
                value={settings.firecrawl_api_key}
                onChange={(e) => updateField("firecrawl_api_key", e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!settings.firecrawl_api_url || testing === "firecrawl"}
                onClick={() => handleTest("firecrawl")}
              >
                {testing === "firecrawl" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                Test
              </Button>
            </div>
            {envSources.has("firecrawl_api_key") ? (
              <p className="text-xs text-muted-foreground">Loaded from FIRECRAWL_API_KEY environment variable</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only needed if you enabled auth on your Firecrawl instance. Leave blank for default self-hosted setup.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3 bg-muted/50 space-y-1">
            <p className="text-sm font-medium">What Firecrawl enables</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>Company Intelligence — scrapes real company data (office addresses, about page, team size)</li>
              <li>Job Map — accurate office locations from company websites instead of city-center pins</li>
              <li>Resume Tailoring — full job descriptions scraped from apply URLs</li>
              <li>Job Search — enriches truncated descriptions from providers</li>
            </ul>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  Update Map Coordinates
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Re-geocode all jobs using Firecrawl search to find actual office addresses.
                  Fixes city-center pins with real office locations.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={geocoding || !settings.firecrawl_api_url}
                onClick={() => handleUpdateMapCoordinates(false)}
              >
                {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Update New Only
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={geocoding || !settings.firecrawl_api_url}
                onClick={() => handleUpdateMapCoordinates(true)}
              >
                {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Force Re-geocode All
              </Button>
            </div>
            {geocodeProgress && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {geocodeProgress}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>

      <SearchConfigSettings />

      <GamificationSettings />

      <CronSettings />

      <DataManagement />
    </div>
  );
}

const SCHEDULE_PRESETS = [
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily at 9 AM", value: "0 9 * * *" },
  { label: "Daily at 6 AM", value: "0 6 * * *" },
  { label: "Twice a day (9 AM & 6 PM)", value: "0 9,18 * * *" },
  { label: "Every weekday at 8 AM", value: "0 8 * * 1-5" },
  { label: "Weekly (Monday 9 AM)", value: "0 9 * * 1" },
  { label: "Custom", value: "custom" },
];

const DATE_POSTED_OPTIONS = [
  { label: "Last 24 hours", value: "1d" },
  { label: "Last 3 days", value: "3d" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 14 days", value: "14d" },
  { label: "Last 30 days", value: "30d" },
];

interface CronStatus {
  enabled: boolean;
  schedule: string;
  datePosted: string;
  resultsPerPage: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
  lastRunJobsFound: number | null;
  isRunning: boolean;
}

interface CronHistoryEntry {
  id: number;
  status: string;
  jobsFound: number;
  queriesRun: number;
  providersUsed: string;
  message: string | null;
  durationMs: number | null;
  createdAt: string;
}

function CronSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<CronHistoryEntry[]>([]);
  const [config, setConfig] = useState<CronStatus>({
    enabled: false,
    schedule: "0 9 * * *",
    datePosted: "7d",
    resultsPerPage: 25,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunMessage: null,
    lastRunJobsFound: null,
    isRunning: false,
  });
  const [customCron, setCustomCron] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("0 9 * * *");

  useEffect(() => {
    fetch("/api/cron")
      .then((res) => res.json())
      .then((data: CronStatus) => {
        setConfig(data);
        const preset = SCHEDULE_PRESETS.find((p) => p.value === data.schedule);
        if (preset) {
          setSelectedPreset(data.schedule);
        } else {
          setSelectedPreset("custom");
          setCustomCron(data.schedule);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const schedule = selectedPreset === "custom" ? customCron : selectedPreset;
      const res = await fetch("/api/cron", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule,
          enabled: config.enabled,
          datePosted: config.datePosted,
          resultsPerPage: config.resultsPerPage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig(data);
        toast("Cron schedule saved", "success");
      } else {
        toast(data.error || "Failed to save", "error");
      }
    } catch {
      toast("Failed to save cron settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    setConfig((prev) => ({ ...prev, isRunning: true, lastRunStatus: "running" }));
    try {
      const res = await fetch("/api/cron/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setConfig((prev) => ({
          ...prev,
          lastRunAt: new Date().toISOString(),
          lastRunStatus: data.status,
          lastRunMessage: data.message,
          lastRunJobsFound: data.jobsFound,
          isRunning: false,
        }));
        toast(data.message || "Search completed", data.status === "success" ? "success" : "error");
      } else {
        setConfig((prev) => ({ ...prev, isRunning: false }));
        toast(data.error || "Failed to run", "error");
      }
    } catch {
      setConfig((prev) => ({ ...prev, isRunning: false }));
      toast("Failed to trigger search", "error");
    } finally {
      setRunning(false);
    }
  };

  const loadHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    try {
      const res = await fetch("/api/cron/history");
      const data = await res.json();
      setHistory(data);
      setShowHistory(true);
    } catch {
      toast("Failed to load history", "error");
    }
  };

  if (loading) return null;

  const scheduleLabel = selectedPreset === "custom"
    ? customCron
    : SCHEDULE_PRESETS.find((p) => p.value === selectedPreset)?.label || selectedPreset;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Automated Job Search
        </CardTitle>
        <CardDescription>
          Schedule automatic job searches based on your resume and preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Enable Scheduled Search</p>
            <p className="text-xs text-muted-foreground">
              {config.enabled ? `Running: ${scheduleLabel}` : "Disabled — no automatic searches"}
            </p>
          </div>
          <Button
            variant={config.enabled ? "default" : "outline"}
            size="sm"
            onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          >
            {config.enabled ? "Enabled" : "Disabled"}
          </Button>
        </div>

        {/* Schedule Picker */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Schedule</Label>
            <Select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                if (e.target.value !== "custom") {
                  setCustomCron("");
                }
              }}
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </div>

          {selectedPreset === "custom" && (
            <div className="space-y-2">
              <Label>Cron Expression</Label>
              <Input
                placeholder="0 9 * * *"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Format: minute hour day month weekday (e.g. &quot;0 */6 * * *&quot; = every 6h)
              </p>
            </div>
          )}
        </div>

        {/* Search Parameters */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Job Recency</Label>
            <Select
              value={config.datePosted}
              onChange={(e) => setConfig((prev) => ({ ...prev, datePosted: e.target.value }))}
            >
              {DATE_POSTED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Results per Query</Label>
            <Select
              value={String(config.resultsPerPage)}
              onChange={(e) => setConfig((prev) => ({ ...prev, resultsPerPage: Number(e.target.value) }))}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Schedule
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunNow}
            disabled={running || config.isRunning}
          >
            {running || config.isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Now
          </Button>
          <Button variant="ghost" size="sm" onClick={loadHistory}>
            <Timer className="h-4 w-4" />
            {showHistory ? "Hide" : "History"}
          </Button>
        </div>

        {/* Last Run Status */}
        {config.lastRunAt && (
          <div className="rounded-lg border p-3 bg-muted/50">
            <div className="flex items-center gap-2 mb-1">
              {config.lastRunStatus === "success" ? (
                <CheckCircle className="h-4 w-4 text-foreground" />
              ) : config.lastRunStatus === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <XCircle className="h-4 w-4 text-foreground" />
              )}
              <span className="text-sm font-medium capitalize">{config.lastRunStatus}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {formatRelativeTime(config.lastRunAt)}
              </span>
            </div>
            {config.lastRunMessage && (
              <p className="text-xs text-muted-foreground">{config.lastRunMessage}</p>
            )}
            {config.lastRunJobsFound != null && config.lastRunJobsFound > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {config.lastRunJobsFound} jobs found
              </p>
            )}
          </div>
        )}

        {/* Run History */}
        {showHistory && history.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent Runs</p>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 rounded border px-3 py-2 text-xs">
                  {entry.status === "success" ? (
                    <CheckCircle className="h-3 w-3 text-foreground shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 text-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{entry.message}</span>
                  {entry.durationMs != null && (
                    <span className="text-muted-foreground shrink-0">{(entry.durationMs / 1000).toFixed(1)}s</span>
                  )}
                  <span className="text-muted-foreground shrink-0">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showHistory && history.length === 0 && (
          <p className="text-xs text-muted-foreground">No runs yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function DataManagement() {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    { target: "jobs", label: "Delete All Job Searches & Results", description: "Removes all searched jobs, results, and saved jobs. Start fresh with new searches." },
    { target: "saved_jobs", label: "Delete Saved Jobs Only", description: "Removes your bookmarked/saved jobs. Search results are kept." },
    { target: "resumes", label: "Delete All Resumes & Analyses", description: "Removes all uploaded resumes, parsed text, and AI analyses." },
    { target: "preferences", label: "Reset Preferences", description: "Clears all job preferences. You can re-generate them from your resume." },
    { target: "networking", label: "Delete Networking Data", description: "Removes LinkedIn imports, Happenstance contacts, and outreach tracking records." },
    { target: "company_cache", label: "Clear Company Cache", description: "Clears cached salary data, company profiles, and geocode results. They'll be re-fetched on next view." },
  ];

  const handleDelete = async (target: string) => {
    setDeleting(true);
    try {
      const res = await fetch("/api/data/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message, "success");
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete", "error");
    } finally {
      setDeleting(false);
      setConfirm(null);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          Data Management
        </CardTitle>
        <CardDescription>
          Delete specific data or reset everything. API keys are never deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action) => (
          <div key={action.target} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
            {confirm === action.target ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive font-medium">Sure?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(action.target)}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, Delete"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm(action.target)}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            )}
          </div>
        ))}

        {/* Nuclear option */}
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Delete Everything</p>
                <p className="text-xs text-muted-foreground">Removes all data: jobs, resumes, preferences, networking, caches. API keys are preserved.</p>
              </div>
            </div>
            {confirm === "everything" ? (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete("everything")}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirm("everything")}
                className="shrink-0"
              >
                Reset All
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
