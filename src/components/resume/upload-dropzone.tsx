"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface UploadDropzoneProps {
  onUploadComplete: (resume: { id: number; fileName: string; parsedText: string }) => void;
}

export function UploadDropzone({ onUploadComplete }: UploadDropzoneProps) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "docx"].includes(ext || "")) {
        toast("Only PDF and DOCX files are supported", "error");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast("File must be under 10MB", "error");
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/resume/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const resume = await res.json();
        toast("Resume uploaded successfully!", "success");
        onUploadComplete(resume);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [onUploadComplete, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
        uploading && "pointer-events-none opacity-60"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {uploading ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Uploading and parsing...</p>
        </>
      ) : (
        <>
          <Upload className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium mb-1">Drop your resume here</p>
          <p className="text-xs text-muted-foreground mb-4">PDF or DOCX, max 10MB</p>
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <FileText className="h-4 w-4" />
            Browse Files
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx"
              onChange={handleInputChange}
            />
          </label>
        </>
      )}
    </div>
  );
}
