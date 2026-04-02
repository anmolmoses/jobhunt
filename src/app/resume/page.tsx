"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadDropzone } from "@/components/resume/upload-dropzone";
import { AnalysisCard } from "@/components/resume/analysis-card";
import { useToast } from "@/components/ui/toast";
import {
  FileText, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp, Star, StarOff, Eye,
} from "lucide-react";

interface Resume {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  parsedText: string | null;
  createdAt: string;
  analysis?: Analysis | null;
}

interface Analysis {
  id: number;
  overallScore: number;
  formattingScore: number;
  contentScore: number;
  keywordScore: number;
  atsScore: number;
  summary: string;
  strengths: string | string[];
  improvements: string | string[];
  toRemove: string | string[];
  toAdd: string | string[];
  detailedFeedback: string;
  aiProvider: string;
  createdAt: string;
}

function parseJsonField(field: string | string[]): string[] {
  if (Array.isArray(field)) return field;
  try { return JSON.parse(field); } catch { return []; }
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-600 bg-green-100" : score >= 40 ? "text-yellow-600 bg-yellow-100" : "text-red-600 bg-red-100";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>{score}/100</span>;
}

export default function ResumePage() {
  const { toast } = useToast();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showText, setShowText] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadResumes = async () => {
    try {
      const res = await fetch("/api/resume/all");
      const data = await res.json();
      setResumes(Array.isArray(data) ? data : []);
      // Auto-select the first (most recent) if none selected
      if (Array.isArray(data) && data.length > 0 && !selectedResume) {
        setSelectedResume(data[0]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResumes();
  }, []);

  const handleUploadComplete = async (uploaded: { id: number; fileName: string; parsedText: string }) => {
    // Reload all resumes
    const res = await fetch("/api/resume/all");
    const data = await res.json();
    setResumes(Array.isArray(data) ? data : []);

    // Select the new one
    const newResume = (data as Resume[]).find((r) => r.id === uploaded.id);
    if (newResume) setSelectedResume(newResume);

    // Auto-trigger analysis
    setAnalyzing(true);
    try {
      const analyzeRes = await fetch("/api/resume/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: uploaded.id }),
      });
      if (analyzeRes.ok) {
        toast("Resume analyzed automatically!", "success");
        loadResumes();
      }
    } catch {
      // silent
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async (resume: Resume) => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/resume/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: resume.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }
      toast("Resume analyzed!", "success");
      loadResumes();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Analysis failed", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/resume/${id}`, { method: "DELETE" });
      if (selectedResume?.id === id) setSelectedResume(null);
      toast("Resume deleted", "success");
      loadResumes();
    } catch {
      toast("Failed to delete", "error");
    } finally {
      setDeleting(null);
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
      <div>
        <h1 className="text-3xl font-bold">Resumes</h1>
        <p className="text-muted-foreground mt-1">Upload and manage your resumes. AI analyzes each one automatically.</p>
      </div>

      {/* Upload area */}
      <UploadDropzone onUploadComplete={handleUploadComplete} />

      {/* Resume list */}
      {resumes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Your Resumes ({resumes.length})</h2>
          {resumes.map((resume) => {
            const isSelected = selectedResume?.id === resume.id;
            const score = resume.analysis?.overallScore;

            return (
              <Card
                key={resume.id}
                className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                onClick={() => setSelectedResume(isSelected ? null : resume)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{resume.fileName}</p>
                          {resume.id === resumes[0]?.id && (
                            <Badge variant="secondary" className="text-xs">Latest</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {resume.fileType.toUpperCase()} &middot; {(resume.fileSize / 1024).toFixed(1)} KB &middot; {new Date(resume.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {score != null && <ScoreBadge score={score} />}
                      {!resume.analysis && !analyzing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleAnalyze(resume); }}
                        >
                          <Sparkles className="h-3 w-3" />
                          Analyze
                        </Button>
                      )}
                      {analyzing && selectedResume?.id === resume.id && (
                        <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin" /> Analyzing...</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleDelete(resume.id); }}
                        disabled={deleting === resume.id}
                      >
                        {deleting === resume.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Selected resume detail */}
      {selectedResume && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {selectedResume.fileName}
            </h2>
            <Button
              onClick={() => handleAnalyze(selectedResume)}
              disabled={analyzing}
              variant="outline"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {selectedResume.analysis ? "Re-analyze" : "Analyze with AI"}
            </Button>
          </div>

          {/* Parsed text toggle */}
          {selectedResume.parsedText && (
            <Card>
              <CardContent className="py-3">
                <button
                  onClick={() => setShowText(!showText)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showText ? "Hide" : "Show"} parsed text
                </button>
                {showText && (
                  <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">
                    {selectedResume.parsedText}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}

          {/* Analysis */}
          {selectedResume.analysis && (
            <AnalysisCard
              analysis={{
                overallScore: selectedResume.analysis.overallScore,
                formattingScore: selectedResume.analysis.formattingScore,
                contentScore: selectedResume.analysis.contentScore,
                keywordScore: selectedResume.analysis.keywordScore,
                atsScore: selectedResume.analysis.atsScore,
                summary: selectedResume.analysis.summary,
                strengths: parseJsonField(selectedResume.analysis.strengths),
                improvements: parseJsonField(selectedResume.analysis.improvements),
                toRemove: parseJsonField(selectedResume.analysis.toRemove),
                toAdd: parseJsonField(selectedResume.analysis.toAdd),
                detailedFeedback: selectedResume.analysis.detailedFeedback,
              }}
            />
          )}
        </div>
      )}

      {resumes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No resumes uploaded yet</p>
            <p className="text-sm mt-1">Upload your first resume above. AI will analyze it automatically.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
