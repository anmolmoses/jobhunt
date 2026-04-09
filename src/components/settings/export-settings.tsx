"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  FileSpreadsheet, Download, Save, Loader2, TestTube, RefreshCw,
  CheckCircle, XCircle, Info,
} from "lucide-react";

export function ExportSettings() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [sheetId, setSheetId] = useState("");
  const [credentialsJson, setCredentialsJson] = useState("");
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [jsonDirty, setJsonDirty] = useState(false);

  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; title?: string; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setEnabled(data.google_sheets_enabled === "true");
        setSheetId(data.google_sheet_id || "");
        if (data.google_service_account_json === "__configured__") {
          setCredentialsConfigured(true);
        }
        setLastSync(data.google_sheets_last_sync || null);
        setLastError(data.google_sheets_last_error || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        google_sheets_enabled: enabled ? "true" : "false",
        google_sheet_id: sheetId,
      };
      if (jsonDirty && credentialsJson) {
        // Validate JSON before saving
        try {
          JSON.parse(credentialsJson);
        } catch {
          toast("Invalid JSON. Please paste the full service account JSON.", "error");
          setSaving(false);
          return;
        }
        payload.google_service_account_json = credentialsJson;
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      if (jsonDirty && credentialsJson) {
        setCredentialsConfigured(true);
        setJsonDirty(false);
        setCredentialsJson("");
      }
      toast("Export settings saved!", "success");
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/export/sheets/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast(`Connected to "${data.title}"`, "success");
      } else {
        toast(data.error || "Connection failed", "error");
      }
    } catch {
      setTestResult({ success: false, error: "Connection failed" });
      toast("Connection failed", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      // Trigger a sync by calling the tracker endpoint (which triggers sync on mutation)
      // Instead, directly call a sync endpoint — we'll use a lightweight PATCH
      const res = await fetch("/api/export/sheets/sync", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLastSync(data.syncedAt || new Date().toISOString());
      setLastError(null);
      toast("Synced to Google Sheets!", "success");
    } catch {
      toast("Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/export/excel");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-tracker-${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Excel exported!", "success");
    } catch {
      toast("Failed to export", "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Export & Google Sheets Sync
        </CardTitle>
        <CardDescription>
          Download tracker data as Excel or auto-sync to Google Sheets on every update
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Excel Export */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Excel Export</Label>
          <p className="text-sm text-muted-foreground">
            Download all tracked jobs and interviews as an Excel file.
          </p>
          <Button variant="outline" onClick={handleExportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Excel
          </Button>
        </div>

        <div className="border-t pt-6 space-y-4">
          {/* Google Sheets Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Google Sheets Auto-Sync</Label>
              <p className="text-sm text-muted-foreground">
                Automatically sync tracker data to a Google Sheet whenever you make changes.
              </p>
            </div>
            <Button
              variant={enabled ? "default" : "outline"}
              size="sm"
              onClick={() => setEnabled(!enabled)}
            >
              {enabled ? "Enabled" : "Disabled"}
            </Button>
          </div>

          {enabled && (
            <div className="space-y-4 pl-0">
              {/* Sheet ID */}
              <div className="space-y-1.5">
                <Label htmlFor="sheet-id">Google Sheet ID</Label>
                <Input
                  id="sheet-id"
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                />
                <p className="text-xs text-muted-foreground">
                  The ID from your Google Sheet URL: docs.google.com/spreadsheets/d/<strong>{'<this-part>'}</strong>/edit
                </p>
              </div>

              {/* Service Account JSON */}
              <div className="space-y-1.5">
                <Label htmlFor="creds-json">Service Account JSON</Label>
                {credentialsConfigured && !jsonDirty ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      <CheckCircle className="inline h-4 w-4 text-green-500 mr-1.5" />
                      Service account credentials configured
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCredentialsConfigured(false);
                        setJsonDirty(true);
                        setCredentialsJson("");
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <Textarea
                    id="creds-json"
                    value={credentialsJson}
                    onChange={(e) => {
                      setCredentialsJson(e.target.value);
                      setJsonDirty(true);
                    }}
                    placeholder='Paste your service account JSON key here...'
                    rows={6}
                    className="font-mono text-xs"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Download this from Google Cloud Console after creating a service account.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing || (!credentialsConfigured && !credentialsJson)}
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  Test Connection
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSyncNow}
                  disabled={syncing || !credentialsConfigured}
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync Now
                </Button>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`flex items-center gap-2 text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                  {testResult.success ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Connected to &quot;{testResult.title}&quot;
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      {testResult.error}
                    </>
                  )}
                </div>
              )}

              {/* Sync Status */}
              {lastSync && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(lastSync).toLocaleString()}
                </p>
              )}
              {lastError && (
                <p className="text-xs text-red-500">
                  Last error: {lastError}
                </p>
              )}

              {/* Setup Instructions */}
              <div className="rounded-md border bg-muted/50 p-3 space-y-1.5">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Info className="h-4 w-4" />
                  Setup Instructions
                </p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Go to <span className="font-mono">console.cloud.google.com</span> and create a project (or use existing)</li>
                  <li>Enable the <strong>Google Sheets API</strong> under APIs & Services</li>
                  <li>Go to Credentials &rarr; Create Credentials &rarr; <strong>Service Account</strong></li>
                  <li>Create a key (JSON type) and download it</li>
                  <li>Create a Google Sheet and share it with the service account email (the <span className="font-mono">client_email</span> from the JSON)</li>
                  <li>Paste the JSON key above and enter the Sheet ID</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
