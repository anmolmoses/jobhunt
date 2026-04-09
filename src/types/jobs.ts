export interface JobSearchParams {
  query: string;
  location?: string;
  remote?: boolean;
  datePosted?: "1d" | "3d" | "7d" | "14d" | "30d";
  salaryMin?: number;
  employmentType?: ("full_time" | "contract" | "part_time")[];
  experienceLevel?: "entry" | "mid" | "senior" | "lead" | "executive";
  page?: number;
  resultsPerPage?: number;
}

export type JobProviderName = "jsearch" | "adzuna" | "remotive" | "linkedin" | "linkedin-auth" | "indeed" | "remoteok" | "jobicy" | "hackernews" | "firecrawl" | "greenhouse" | "manual";

export interface NormalizedJob {
  externalId: string;
  provider: JobProviderName;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  jobType: string | null;
  isRemote: boolean;
  applyUrl: string | null;
  companyLogo: string | null;
  postedAt: string | null;
  tags: string[];
  relevanceScore: number | null;
  dedupeKey: string;
  atsScore?: number; // ATS keyword match score vs resume
}

export interface JobSearchProvider {
  readonly name: JobProviderName;
  search(params: JobSearchParams): Promise<NormalizedJob[]>;
  isConfigured(): Promise<boolean>;
}

export type JobStatus = "saved" | "applied" | "interviewing" | "rejected" | "offered";

export type SortOption = "relevance" | "recent" | "salary";
