export interface JobPreferencesData {
  desiredRoles: string[];
  desiredIndustries: string[];
  experienceLevel: ("entry" | "mid" | "senior" | "lead" | "executive")[];
  locationPreference: ("remote" | "hybrid" | "onsite")[];
  preferredLocations: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: ("full_time" | "contract" | "part_time")[];
  desiredSkills: string[];
  excludeKeywords: string[];
  companySizePreference: ("startup" | "mid" | "enterprise")[];
  additionalNotes: string | null;
}
