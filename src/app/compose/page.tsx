"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

type InputMode = "url" | "text" | "image";

interface ComposeResult {
  jobTitle: string;
  company: string;
  referralMessage: string;
  recruiterMessage: string;
  fitSummary: string;
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
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [editedReferral, setEditedReferral] = useState("");
  const [editedRecruiter, setEditedRecruiter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readImageFile = useCallback((file: File) => {
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
  }, [toast]);

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
      setEditedReferral(data.referralMessage || "");
      setEditedRecruiter(data.recruiterMessage || "");
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

  const charCount = (s: string) => s.length;
  const overLimit = (s: string) => charCount(s) > 300;

  return (
    <div className="container max-w-5xl py-8">
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
                  <p className="text-sm">
                    Drop a screenshot, paste one (⌘+V), or
                  </p>
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
                  <p className="mt-2 text-xs">Requires a Claude API key (vision model).</p>
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
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detected opening
            </div>
            <div className="mt-1 text-lg font-semibold">
              {result.jobTitle || "—"}{" "}
              <span className="text-muted-foreground">
                {result.company ? `@ ${result.company}` : ""}
              </span>
            </div>
            {result.fitSummary && (
              <div className="mt-1 text-sm text-muted-foreground">{result.fitSummary}</div>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <MessageCard
              icon={<Users className="h-5 w-5" />}
              title="To an employee (referral ask)"
              subtitle="Sent as a LinkedIn connection request or DM"
              value={editedReferral}
              onChange={setEditedReferral}
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
              onChange={setEditedRecruiter}
              onCopy={() => copyToClipboard(editedRecruiter, "Recruiter message")}
              overLimit={overLimit(editedRecruiter)}
              charCount={charCount(editedRecruiter)}
              onRegenerate={generate}
              loading={loading}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
            <strong>Tips:</strong> Replace <code className="rounded bg-muted px-1">[Name]</code> with the
            recipient&apos;s first name. Edit freely — hit <em>Regenerate</em> for a different angle. LinkedIn
            limits connection-request notes to 300 characters.
          </div>
        </div>
      )}
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
