"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, FileText, Trash2, Download, Loader2, Pencil, Upload } from "lucide-react";

interface ResumeBuild {
  id: number;
  name: string;
  contactInfo: { name?: string };
  pdfPath: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UploadedResume {
  id: number;
  fileName: string;
  createdAt: string;
}

export default function BuilderListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [builds, setBuilds] = useState<ResumeBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [uploadedResumes, setUploadedResumes] = useState<UploadedResume[]>([]);

  useEffect(() => {
    fetch("/api/resume-builder")
      .then((r) => r.json())
      .then((d) => setBuilds(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openSourcePicker = async () => {
    setShowSourcePicker(true);
    try {
      const res = await fetch("/api/resume/all");
      if (res.ok) {
        const data = await res.json();
        setUploadedResumes(
          (Array.isArray(data) ? data : []).map((r: { id: number; fileName: string; createdAt: string }) => ({
            id: r.id, fileName: r.fileName, createdAt: r.createdAt,
          }))
        );
      }
    } catch { /* ignore */ }
  };

  const handleCreate = async (fromResumeId?: number) => {
    setShowSourcePicker(false);
    setCreating(true);
    try {
      const res = await fetch("/api/resume-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Resume",
          ...(fromResumeId && { fromResumeId }),
        }),
      });
      const build = await res.json();
      router.push(`/builder/${build.id}`);
    } catch {
      toast("Failed to create resume", "error");
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/resume-builder/${id}`, { method: "DELETE" });
    setBuilds((prev) => prev.filter((b) => b.id !== id));
    toast("Resume deleted", "success");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Resume Builder</h1>
          <p className="text-muted-foreground mt-1">Create and customize your resumes. Export to PDF on demand.</p>
        </div>
        <Button onClick={openSourcePicker} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Resume
        </Button>
      </div>

      {builds.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No custom resumes yet</p>
            <p className="text-sm mt-1">Click &ldquo;New Resume&rdquo; to start building one from scratch.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {builds.map((build) => (
            <Card key={build.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{build.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Updated {new Date(build.updatedAt).toLocaleDateString()}
                    </p>
                    {build.pdfPath && <Badge variant="success" className="mt-1 text-xs">PDF Ready</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/builder/${build.id}`)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    {build.pdfPath && (
                      <a href={`/api/resume-builder/${build.id}/pdf`}>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3" /> PDF
                        </Button>
                      </a>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(build.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* Source Picker Dialog */}
      <Dialog open={showSourcePicker} onOpenChange={setShowSourcePicker}>
        <DialogContent onClose={() => setShowSourcePicker(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Resume</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Start from scratch or import from an uploaded resume.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleCreate()}
              className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors text-left"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Blank Resume</p>
                <p className="text-xs text-muted-foreground">Start with an empty template</p>
              </div>
            </button>
            {uploadedResumes.map((r) => (
              <button
                key={r.id}
                onClick={() => handleCreate(r.id)}
                className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors text-left"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Import from {r.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    AI will extract sections from your uploaded resume
                  </p>
                </div>
              </button>
            ))}
            {uploadedResumes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No uploaded resumes found. Upload one on the Resume page first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
