"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Plus, FileText, Trash2, Download, Loader2, Pencil } from "lucide-react";

interface ResumeBuild {
  id: number;
  name: string;
  contactInfo: { name?: string };
  pdfPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function BuilderListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [builds, setBuilds] = useState<ResumeBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/resume-builder")
      .then((r) => r.json())
      .then((d) => setBuilds(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/resume-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Resume" }),
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
        <Button onClick={handleCreate} disabled={creating}>
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
    </div>
  );
}
