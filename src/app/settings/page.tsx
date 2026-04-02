"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Save, TestTube, Loader2, Trash2, AlertTriangle } from "lucide-react";

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
    logodev_api_key: "",
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>

      <DataManagement />
    </div>
  );
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
    { target: "networking", label: "Delete Networking Data", description: "Removes all Happenstance contacts and outreach tracking records." },
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
