"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  Loader2,
  Send,
  Link2,
  FileText,
  Image as ImageIcon,
  Copy,
  RefreshCw,
  Users,
  UserCheck,
  X,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Clock,
  ExternalLink,
} from "lucide-react";

type InputMode = "url" | "text" | "image";

interface ComposeResult {
  id: number;
  jobTitle: string;
  company: string;
  referralMessage: string;
  recruiterMessage: string;
  fitSummary: string;
  savedJobId: number | null;
  createdAt?: string;
}

interface DraftListItem {
  id: number;
  sourceType: string;
  sourceUrl: string | null;
  jobTitle: string | null;
  company: string | null;
  fitSummary: string | null;
  referralMessage: string | null;
  recruiterMessage: string | null;
  savedJobId: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function ComposePage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [editedJobTitle, setEditedJobTitle] = useState("");
  const [editedCompany, setEditedCompany] = useState("");
  const [editedReferral, setEditedReferral] = useState("");
  const [editedRecruiter, setEditedRecruiter] = useState("");
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await fetch("/api/compose");
      if (res.ok) {
        const list = (await res.json()) as DraftListItem[];
        setDrafts(list);
      }
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const saveEdits = useCallback(
    async (patch: Partial<ComposeResult>) => {
      if (!result?.id) return;
      try {
        await fetch(`/api/compose/${result.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        loadDrafts();
      } catch {
        /* silent — edits remain in-memory */
      }
    },
    [result?.id, loadDrafts],
  );

  const scheduleEditSave = useCallback(
    (patch: Partial<ComposeResult>) => {
      if (editTimer.current) clearTimeout(editTimer.current);
      editTimer.current = setTimeout(() => saveEdits(patch), 800);
    },
    [saveEdits],
  );

  const readImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast("Please pick an image file.", "error");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast("Image too large — keep it under 8MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setImageBase64(base64);
        setImageMimeType(file.type);
        setImagePreview(dataUrl);
        setMode("image");
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readImageFile(file);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            readImageFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    },
    [readImageFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) readImageFile(file);
    },
    [readImageFile],
  );

  const clearImage = () => {
    setImageBase64(null);
    setImageMimeType(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const generate = async () => {
    if (mode === "url" && !url.trim()) {
      toast("Paste a job URL first.", "error");
      return;
    }
    if (mode === "text" && !description.trim()) {
      toast("Paste the job description first.", "error");
      return;
    }
    if (mode === "image" && !imageBase64) {
      toast("Add a screenshot first.", "error");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (mode === "url") payload.url = url.trim();
      if (mode === "text") payload.description = description;
      if (mode === "image" && imageBase64 && imageMimeType) {
        payload.imageBase64 = imageBase64;
        payload.imageMimeType = imageMimeType;
      }

      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || "Generation failed", "error");
        return;
      }

      setResult(data);
      setEditedJobTitle(data.jobTitle || "");
      setEditedCompany(data.company || "");
      setEditedReferral(data.referralMessage || "");
      setEditedRecruiter(data.recruiterMessage || "");
      loadDrafts();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unknown error", "error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`, "success");
    } catch {
      toast("Copy failed — select and copy manually", "error");
    }
  };

  const saveToTracker = async () => {
    if (!result?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/compose/${result.id}/save-to-tracker`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Save failed", "error");
        return;
      }
      setResult({ ...result, savedJobId: data.savedJobId });
      toast(
        data.alreadySaved ? "Already in tracker" : "Saved to tracker",
        "success",
        { label: "View", href: "/tracker" },
      );
      loadDrafts();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const loadDraft = (d: DraftListItem) => {
    setResult({
      id: d.id,
      jobTitle: d.jobTitle || "",
      company: d.company || "",
      fitSummary: d.fitSummary || "",
      referralMessage: d.referralMessage || "",
      recruiterMessage: d.recruiterMessage || "",
      savedJobId: d.savedJobId,
      createdAt: d.createdAt,
    });
    setEditedJobTitle(d.jobTitle || "");
    setEditedCompany(d.company || "");
    setEditedReferral(d.referralMessage || "");
    setEditedRecruiter(d.recruiterMessage || "");
    if (d.sourceUrl) {
      setUrl(d.sourceUrl);
      setMode("url");
    }
  };

  const deleteDraft = async (id: number) => {
    try {
      const res = await fetch(`/api/compose/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Delete failed", "error");
        return;
      }
      if (result?.id === id) setResult(null);
      loadDrafts();
    } catch {
      toast("Delete failed", "error");
    }
  };

  const charCount = (s: string) => s.length;
  const overLimit = (s: string) => charCount(s) > 300;

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso + "Z").getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Sparkles className="h-8 w-8 text-primary" />
          Compose Outreach
        </h1>
        <p className="mt-2 text-muted-foreground">
          Paste a job link, description, or screenshot — get a referral ask for an employee and a
          pitch for a recruiter, grounded in your resume.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Job opening</CardTitle>
              <CardDescription>Pick how you want to share the role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={mode === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("url")}
                >
                  <Link2 className="mr-1 h-4 w-4" />
                  URL
                </Button>
                <Button
                  variant={mode === "text" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("text")}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Description
                </Button>
                <Button
                  variant={mode === "image" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("image")}
                >
                  <ImageIcon className="mr-1 h-4 w-4" />
                  Screenshot
                </Button>
              </div>

              {mode === "url" && (
                <div>
                  <Input
                    type="url"
                    placeholder="https://www.linkedin.com/jobs/view/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    We&apos;ll scrape the page via Firecrawl. Works best with public LinkedIn, Greenhouse, Lever, Ashby.
                  </p>
                </div>
              )}

              {mode === "text" && (
                <Textarea
                  rows={8}
                  placeholder="Paste the job description here — title, company, responsibilities, requirements..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              )}

              {mode === "image" && (
                <div
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary"
                >
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="Job screenshot"
                        className="max-h-72 rounded-md"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-md"
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                      <ImageIcon className="h-10 w-10" />
                      <p className="text-sm">Drop a screenshot, paste one (⌘+V), or</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose file
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFilePick}
                      />
                      <p className="mt-2 text-xs">Uses your configured vision model (Claude or GPT-4o).</p>
                    </div>
                  )}
                </div>
              )}

              <Button onClick={generate} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Generate messages
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {result && (
            <div className="space-y-6">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Detected opening
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Job title"
                        value={editedJobTitle}
                        onChange={(e) => {
                          setEditedJobTitle(e.target.value);
                          scheduleEditSave({ jobTitle: e.target.value });
                        }}
                      />
                      <Input
                        placeholder="Company"
                        value={editedCompany}
                        onChange={(e) => {
                          setEditedCompany(e.target.value);
                          scheduleEditSave({ company: e.target.value });
                        }}
                      />
                    </div>
                    {result.fitSummary && (
                      <div className="text-sm text-muted-foreground">{result.fitSummary}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {result.savedJobId ? (
                      <Link
                        href="/tracker"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <BookmarkCheck className="mr-1 h-4 w-4 text-green-600" />
                        In tracker
                      </Link>
                    ) : (
                      <Button size="sm" onClick={saveToTracker} disabled={saving}>
                        {saving ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Bookmark className="mr-1 h-4 w-4" />
                        )}
                        Save to tracker
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <MessageCard
                  icon={<Users className="h-5 w-5" />}
                  title="To an employee (referral ask)"
                  subtitle="Sent as a LinkedIn connection request or DM"
                  value={editedReferral}
                  onChange={(v) => {
                    setEditedReferral(v);
                    scheduleEditSave({ referralMessage: v });
                  }}
                  onCopy={() => copyToClipboard(editedReferral, "Referral message")}
                  overLimit={overLimit(editedReferral)}
                  charCount={charCount(editedReferral)}
                  onRegenerate={generate}
                  loading={loading}
                />
                <MessageCard
                  icon={<UserCheck className="h-5 w-5" />}
                  title="To a recruiter (fit pitch)"
                  subtitle="Sent via InMail or connection request"
                  value={editedRecruiter}
                  onChange={(v) => {
                    setEditedRecruiter(v);
                    scheduleEditSave({ recruiterMessage: v });
                  }}
                  onCopy={() => copyToClipboard(editedRecruiter, "Recruiter message")}
                  overLimit={overLimit(editedRecruiter)}
                  charCount={charCount(editedRecruiter)}
                  onRegenerate={generate}
                  loading={loading}
                />
              </div>

              <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                <strong>Tips:</strong> Replace <code className="rounded bg-muted px-1">[Name]</code> with the
                recipient&apos;s first name. Edits save automatically. LinkedIn limits connection-request notes to 300 characters.
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Recent drafts
              </CardTitle>
              <CardDescription>
                {drafts.length === 0 && !draftsLoading ? "Nothing yet." : `${drafts.length} draft${drafts.length === 1 ? "" : "s"}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
              {draftsLoading && drafts.length === 0 ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                drafts.map((d) => (
                  <div
                    key={d.id}
                    className={`group rounded-md border p-2 text-sm transition-colors hover:bg-accent ${
                      result?.id === d.id ? "border-primary bg-accent/50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadDraft(d)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{d.jobTitle || "Untitled role"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {d.company || "Unknown company"}
                          </div>
                        </div>
                        {d.savedJobId && (
                          <BookmarkCheck className="h-3 w-3 flex-shrink-0 text-green-600" />
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatRelative(d.createdAt)}</span>
                        <span>·</span>
                        <span className="capitalize">{d.sourceType}</span>
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {d.sourceUrl && (
                        <a
                          href={d.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                          aria-label="Open source"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteDraft(d.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

interface MessageCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: string;
  onChange: (v: string) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  overLimit: boolean;
  charCount: number;
  loading: boolean;
}

function MessageCard({
  icon,
  title,
  subtitle,
  value,
  onChange,
  onCopy,
  onRegenerate,
  overLimit,
  charCount,
  loading,
}: MessageCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={overLimit ? "border-destructive" : ""}
        />
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${
              overLimit ? "font-medium text-destructive" : "text-muted-foreground"
            }`}
          >
            {charCount} / 300
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRegenerate} disabled={loading}>
              <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
            <Button size="sm" onClick={onCopy}>
              <Copy className="mr-1 h-3 w-3" />
              Copy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
