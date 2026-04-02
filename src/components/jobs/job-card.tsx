"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkCheck, MapPin, Building2, Calendar, DollarSign, Plus } from "lucide-react";
import type { NormalizedJob } from "@/types/jobs";

function decodeEntities(str: string): string {
  return str
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&#x22;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))));
}

interface JobCardProps {
  job: NormalizedJob & { dbId?: number };
  isSaved?: boolean;
  onSave?: () => void;
  onUnsave?: () => void;
  onClick?: () => void;
}

export function JobCard({ job, isSaved, onSave, onUnsave, onClick }: JobCardProps) {
  const postedDate = job.postedAt
    ? new Date(job.postedAt).toLocaleDateString()
    : null;

  return (
    <div
      className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {job.companyLogo ? (
            <img
              src={job.companyLogo}
              alt={job.company}
              className="h-10 w-10 rounded-lg object-contain border"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{decodeEntities(job.title)}</h3>
            <p className="text-sm text-muted-foreground">{decodeEntities(job.company)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={isSaved ? "secondary" : "default"}
            size="sm"
            className={isSaved ? "text-primary" : ""}
            onClick={(e) => {
              e.stopPropagation();
              isSaved ? onUnsave?.() : onSave?.();
            }}
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="h-3.5 w-3.5" />
                Tracking
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Track
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.location}
          </span>
        )}
        {job.salary && (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {job.salary}
          </span>
        )}
        {postedDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {postedDate}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {job.isRemote && <Badge variant="success">Remote</Badge>}
        {job.jobType && (
          <Badge variant="secondary">
            {job.jobType === "full_time"
              ? "Full-time"
              : job.jobType === "contract"
              ? "Contract"
              : job.jobType === "part_time"
              ? "Part-time"
              : job.jobType}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {job.provider}
        </Badge>
        {job.relevanceScore !== null && job.relevanceScore > 0 && (
          <Badge variant="secondary" className="text-xs">
            {Math.round(job.relevanceScore * 100)}% match
          </Badge>
        )}
        {(job as { atsScore?: number }).atsScore != null && (job as { atsScore?: number }).atsScore! > 0 && (
          <Badge
            variant={(job as { atsScore?: number }).atsScore! >= 70 ? "success" : (job as { atsScore?: number }).atsScore! >= 40 ? "warning" : "secondary"}
            className="text-xs"
          >
            ATS {(job as { atsScore?: number }).atsScore}%
          </Badge>
        )}
      </div>
    </div>
  );
}
