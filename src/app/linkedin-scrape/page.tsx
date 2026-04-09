"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Play,
  Square,
  Loader2,
  ShieldAlert,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Save,
  Eye,
  EyeOff,
  KeyRound,
  History,
  Terminal,
  Fingerprint,
} from "lucide-react";

interface ScrapeRun {
  id: number;
  status: string;
  jobsFound: number;
  jobsInserted: number;
  pagesScraped: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface LogEntry {
  id: number;
  level: string;
  message: string;
  metadata: string | null;
  createdAt: string;
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export default function LinkedInScrapePage() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<ScrapeRun | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [timeSinceLastRunMs, setTimeSinceLastRunMs] = useState<number | null>(null);
  const [hasCookie, setHasCookie] = useState(false);
  const [history, setHistory] = useState<ScrapeRun[]>([]);
  const [starting, setStarting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // 2-step confirmation: 0 = idle, 1 = first warning shown, 2 = confirmed (or no warning needed)
  const [confirmStep, setConfirmStep] = useState(0);

  // Cookie input
  const [cookieInput, setCookieInput] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [savingCookie, setSavingCookie] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLogIdRef = useRef(0);

  // Whether the last run was recent (< 24h) — triggers warnings
  const ranRecently = timeSinceLastRunMs !== null && timeSinceLastRunMs < TWENTY_FOUR_HOURS;

  // Poll for status updates
  const pollStatus = useCallback(async (runId?: number) => {
    try {
      const params = new URLSearchParams();
      if (runId) params.set("runId", String(runId));
      if (lastLogIdRef.current > 0) params.set("afterLogId", String(lastLogIdRef.current));

      const res = await fetch(`/api/linkedin-scrape/status?${params}`);
      const data = await res.json();

      setIsRunning(data.isRunning);
      setTimeSinceLastRunMs(data.timeSinceLastRunMs);
      setHasCookie(data.hasCookie);

      if (data.run) {
        setCurrentRun(data.run);
      }

      if (data.logs?.length > 0) {
        setLogs((prev) => [...prev, ...data.logs]);
        lastLogIdRef.current = data.logs[data.logs.length - 1].id;
      }

      // Stop polling if scrape is done
      if (data.run && !data.isRunning && data.run.status !== "running") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // Ignore poll errors
    }
  }, []);

  // Initial load
  useEffect(() => {
    pollStatus();
    fetch("/api/linkedin-scrape/history")
      .then((res) => res.json())
      .then((data) => setHistory(data.runs || []))
      .catch(() => {});
  }, [pollStatus]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Reset confirm step when scrape finishes
  useEffect(() => {
    if (!isRunning) setConfirmStep(0);
  }, [isRunning]);

  const handleStartClick = () => {
    if (!ranRecently) {
      // No recent run — go straight to launch
      fireScrape();
      return;
    }

    // Recent run exists — step through warnings
    if (confirmStep === 0) {
      setConfirmStep(1);
      return;
    }
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    // confirmStep === 2 — user confirmed twice
    fireScrape();
  };

  const fireScrape = async () => {
    setStarting(true);
    setConfirmStep(0);
    try {
      const res = await fetch("/api/linkedin-scrape/start", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || "Cannot start scrape", "error");
        return;
      }

      setLogs([]);
      lastLogIdRef.current = 0;
      setCurrentRun(null);

      toast("LinkedIn feed scrape is running in the background.", "success");

      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollStatus(data.runId), 2000);
      pollStatus(data.runId);
    } catch {
      toast("Failed to start scrape", "error");
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await fetch("/api/linkedin-scrape/stop", { method: "POST" });
      toast("Scrape will stop after the current job finishes.", "info");
    } catch {
      toast("Failed to stop scrape", "error");
    }
  };

  const handleSaveCookie = async () => {
    if (!cookieInput.trim()) return;
    setSavingCookie(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_li_at: cookieInput.trim() }),
      });
      if (res.ok) {
        toast("LinkedIn session cookie saved and encrypted.", "success");
        setHasCookie(true);
        setCookieInput("");
      } else {
        toast("Failed to save cookie", "error");
      }
    } catch {
      toast("Failed to save cookie", "error");
    } finally {
      setSavingCookie(false);
    }
  };

  const formatTimeAgo = (ms: number) => {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "running...";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const logLevelIcon = (level: string) => {
    switch (level) {
      case "success":
        return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
      case "error":
        return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
      case "warn":
        return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
      default:
        return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    }
  };

  const canStart = hasCookie && !isRunning && !starting;

  // Button label changes based on confirm step
  const getButtonLabel = () => {
    if (starting) return "Starting...";
    if (!ranRecently || confirmStep === 2) return "Start Scrape";
    if (confirmStep === 0) return "Start Scrape";
    if (confirmStep === 1) return "Yes, I understand the risk — proceed";
    return "Start Scrape";
  };

  const getButtonVariant = (): "default" | "destructive" | "secondary" => {
    if (confirmStep === 1) return "destructive";
    return "default";
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">LinkedIn Feed Scraper</h1>
        <p className="text-muted-foreground mt-1">
          Scrape your personalized LinkedIn job feed using your authenticated session
        </p>
      </div>

      {/* How It Works Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            How It Works
          </CardTitle>
          <CardDescription>
            This feature uses your LinkedIn session to access your personalized job recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">What it does</h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Opens a headless browser with stealth protections
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Injects your LinkedIn session cookie (li_at)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Visits your &quot;Recommended Jobs&quot; and &quot;Job Alerts&quot; pages
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Scrolls like a human to load more results
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Extracts job details and saves them to your jobs database
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Safety measures</h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  Warns you before running again within 24 hours
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  Random delays between actions (2-5s) mimicking human behavior
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  Stealth evasions hide browser automation fingerprints
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  Your cookie is encrypted at rest (AES-256-GCM)
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  Never automates login — only uses existing session
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-600 dark:text-yellow-400">Risk Disclosure</p>
                <p className="text-muted-foreground mt-1">
                  While this tool takes precautions, scraping LinkedIn with an authenticated session carries
                  inherent risk. LinkedIn may detect automated access and temporarily restrict your account.
                  Human-like behavior patterns minimize this risk, but cannot eliminate it entirely.
                  We recommend running at most once per day. Use at your own discretion.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cookie Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Session Cookie
          </CardTitle>
          <CardDescription>
            Your LinkedIn li_at cookie is required to access personalized feeds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasCookie ? (
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-600">Configured</Badge>
              <span className="text-sm text-muted-foreground">
                Your LinkedIn session cookie is saved and encrypted. Paste a new one below to update it.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="destructive">Not configured</Badge>
              <span className="text-sm text-muted-foreground">
                Add your li_at cookie to get started.
              </span>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium mb-2">How to get your li_at cookie:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open LinkedIn in your browser and make sure you&apos;re logged in</li>
              <li>Open DevTools (F12 or Cmd+Option+I)</li>
              <li>Go to the <strong>Application</strong> tab (Chrome) or <strong>Storage</strong> tab (Firefox)</li>
              <li>Under Cookies, find <code className="bg-muted px-1 rounded">.linkedin.com</code></li>
              <li>Find the cookie named <code className="bg-muted px-1 rounded">li_at</code> and copy its value</li>
              <li>Paste it below — it will be encrypted before storage</li>
            </ol>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Label htmlFor="li_at" className="sr-only">li_at cookie</Label>
              <Input
                id="li_at"
                type={showCookie ? "text" : "password"}
                placeholder="Paste your li_at cookie value here..."
                value={cookieInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCookieInput(e.target.value)}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowCookie(!showCookie)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCookie ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button onClick={handleSaveCookie} disabled={!cookieInput.trim() || savingCookie}>
              {savingCookie ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">Save</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scrape Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Scrape Control
          </CardTitle>
          <CardDescription>
            {isRunning
              ? "Scrape is running — jobs are being extracted in the background"
              : timeSinceLastRunMs !== null
              ? `Last run ${formatTimeAgo(timeSinceLastRunMs)}`
              : "Ready to scrape your LinkedIn feed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Confirmation warnings when running again within 24h */}
          {confirmStep >= 1 && ranRecently && (
            <div className="space-y-3">
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">
                      You ran this {formatTimeAgo(timeSinceLastRunMs!)}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Running multiple times within 24 hours increases the chance LinkedIn flags your account
                      for automated activity. We recommend waiting at least 24 hours between runs.
                    </p>
                  </div>
                </div>
              </div>

              {confirmStep >= 2 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-red-600 dark:text-red-400">
                        Final confirmation
                      </p>
                      <p className="text-muted-foreground mt-1">
                        If LinkedIn detects automation, your account could be temporarily restricted
                        (typically a 24-48h lockout requiring a CAPTCHA). Click &quot;Start Scrape&quot; below
                        to proceed anyway.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {!isRunning ? (
              <div className="flex items-center gap-3">
                <Button
                  size="lg"
                  variant={getButtonVariant()}
                  onClick={handleStartClick}
                  disabled={!canStart}
                  className="gap-2"
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {getButtonLabel()}
                </Button>

                {confirmStep > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmStep(0)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ) : (
              <Button
                size="lg"
                variant="destructive"
                onClick={handleStop}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Scrape
              </Button>
            )}

            {ranRecently && !isRunning && confirmStep === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Last run {formatTimeAgo(timeSinceLastRunMs!)}
              </div>
            )}

            {currentRun && !isRunning && (
              <div className="flex items-center gap-2 text-sm">
                <Badge
                  variant={
                    currentRun.status === "completed"
                      ? "default"
                      : currentRun.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                  className={currentRun.status === "completed" ? "bg-green-600" : ""}
                >
                  {currentRun.status}
                </Badge>
                <span className="text-muted-foreground">
                  {currentRun.jobsFound} found, {currentRun.jobsInserted} new
                  {currentRun.finishedAt && ` in ${formatDuration(currentRun.startedAt, currentRun.finishedAt)}`}
                </span>
              </div>
            )}
          </div>

          {/* Live Logs */}
          {(logs.length > 0 || isRunning) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Live Logs
                </h3>
                {logs.length > 0 && (
                  <span className="text-xs text-muted-foreground">{logs.length} entries</span>
                )}
              </div>
              <div
                ref={logContainerRef}
                className="h-64 overflow-y-auto rounded-lg border bg-black/90 p-3 font-mono text-xs"
              >
                {logs.length === 0 && isRunning && (
                  <div className="text-gray-500">Waiting for logs...</div>
                )}
                {logs.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 py-0.5">
                    {logLevelIcon(entry.level)}
                    <span className="text-gray-500 shrink-0">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                    <span
                      className={
                        entry.level === "error"
                          ? "text-red-400"
                          : entry.level === "warn"
                          ? "text-yellow-400"
                          : entry.level === "success"
                          ? "text-green-400"
                          : "text-gray-300"
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Run History
              </CardTitle>
              <CardDescription>Previous scrape runs and their results</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? "Hide" : "Show"} ({history.length})
            </Button>
          </div>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scrape runs yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          run.status === "completed"
                            ? "default"
                            : run.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                        className={run.status === "completed" ? "bg-green-600" : ""}
                      >
                        {run.status}
                      </Badge>
                      <span>
                        {run.jobsFound} found, {run.jobsInserted} inserted
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{formatDuration(run.startedAt, run.finishedAt)}</span>
                      <span>{new Date(run.startedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
