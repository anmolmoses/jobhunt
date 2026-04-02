import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  isEncrypted: integer("is_encrypted", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const resumes = sqliteTable("resumes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  parsedText: text("parsed_text"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const resumeAnalyses = sqliteTable("resume_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resumeId: integer("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").notNull(),
  overallScore: integer("overall_score").notNull(),
  formattingScore: integer("formatting_score").notNull(),
  contentScore: integer("content_score").notNull(),
  keywordScore: integer("keyword_score").notNull(),
  atsScore: integer("ats_score").notNull(),
  summary: text("summary").notNull(),
  strengths: text("strengths").notNull(), // JSON array
  improvements: text("improvements").notNull(), // JSON array
  toRemove: text("to_remove").notNull(), // JSON array
  toAdd: text("to_add").notNull(), // JSON array
  detailedFeedback: text("detailed_feedback").notNull(),
  rawResponse: text("raw_response"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const jobPreferences = sqliteTable("job_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  desiredRoles: text("desired_roles").notNull().default("[]"), // JSON array
  desiredIndustries: text("desired_industries").notNull().default("[]"),
  experienceLevel: text("experience_level").notNull().default('["mid"]'), // JSON array
  locationPreference: text("location_preference").notNull().default('["remote"]'), // JSON array
  preferredLocations: text("preferred_locations").notNull().default("[]"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  employmentType: text("employment_type").notNull().default('["full_time"]'),
  desiredSkills: text("desired_skills").notNull().default("[]"),
  excludeKeywords: text("exclude_keywords").notNull().default("[]"),
  companySizePreference: text("company_size_preference").notNull().default('["startup","mid","enterprise"]'), // JSON array
  additionalNotes: text("additional_notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const jobSearches = sqliteTable("job_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  query: text("query").notNull(),
  filters: text("filters").notNull().default("{}"), // JSON
  providers: text("providers").notNull().default("[]"), // JSON array
  totalResults: integer("total_results").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const jobResults = sqliteTable("job_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchId: integer("search_id")
    .notNull()
    .references(() => jobSearches.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  provider: text("provider").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  salary: text("salary"),
  salaryMin: real("salary_min"),
  salaryMax: real("salary_max"),
  description: text("description"),
  jobType: text("job_type"),
  isRemote: integer("is_remote", { mode: "boolean" }).notNull().default(false),
  applyUrl: text("apply_url"),
  companyLogo: text("company_logo"),
  postedAt: text("posted_at"),
  tags: text("tags").default("[]"), // JSON array
  relevanceScore: real("relevance_score"),
  dedupeKey: text("dedupe_key"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const savedJobs = sqliteTable("saved_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobResultId: integer("job_result_id")
    .notNull()
    .references(() => jobResults.id, { onDelete: "cascade" }),
  notes: text("notes"),
  status: text("status").notNull().default("saved"),
  appliedAt: text("applied_at"),
  followUpDate: text("follow_up_date"),
  nextStep: text("next_step"), // e.g. "Send thank you email", "Prepare for technical round"
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const companyEnrichment = sqliteTable("company_enrichment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  // Salary data (from JSearch estimated-salary API)
  salaryMedian: real("salary_median"),
  salaryMin: real("salary_min"),
  salaryMax: real("salary_max"),
  salaryPublisherName: text("salary_publisher_name"),
  salaryJobTitle: text("salary_job_title"),
  salaryLocation: text("salary_location"),
  // Company info (from AI analysis)
  companySize: text("company_size"), // "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"
  companySizeCategory: text("company_size_category"), // "startup", "mid", "enterprise"
  companyType: text("company_type"), // "public", "private", "startup", "nonprofit", "government"
  industry: text("industry"),
  description: text("description"),
  headquarters: text("headquarters"),
  aiInsights: text("ai_insights"),
  rawSalaryData: text("raw_salary_data"), // JSON
  rawAiResponse: text("raw_ai_response"), // JSON
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Contacts found via Happenstance for a company
export const networkContacts = sqliteTable("network_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  normalizedCompany: text("normalized_company").notNull(),
  // Person info from Happenstance
  personName: text("person_name").notNull(),
  personTitle: text("person_title"),
  personLinkedin: text("person_linkedin"),
  personEmail: text("person_email"),
  personLocation: text("person_location"),
  personBio: text("person_bio"),
  personImageUrl: text("person_image_url"),
  // Connection info
  connectionType: text("connection_type"), // "direct", "second_degree", "group"
  mutualConnections: text("mutual_connections"), // JSON array of mutual names
  introducerName: text("introducer_name"), // who can intro you
  // Happenstance metadata
  happenstanceSearchId: text("happenstance_search_id"),
  rawData: text("raw_data"), // full JSON from Happenstance
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Outreach tracking
export const outreachTracking = sqliteTable("outreach_tracking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => networkContacts.id, { onDelete: "cascade" }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "set null" }),
  // Outreach details
  channel: text("channel").notNull(), // "linkedin", "email", "phone", "other"
  status: text("status").notNull().default("planned"), // "planned", "sent", "replied", "no_reply", "meeting_scheduled", "declined"
  messageTemplate: text("message_template"), // what was sent
  notes: text("notes"),
  sentAt: text("sent_at"),
  repliedAt: text("replied_at"),
  followUpDate: text("follow_up_date"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Activity log — tracks everything the user does
export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "status_change", "note_added", "interview_scheduled", "follow_up_due", "applied", "outreach_sent", "offer_received", "rejected"
  title: text("title").notNull(),
  description: text("description"),
  metadata: text("metadata"), // JSON for extra data
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Resume builder — user-created resumes
export const resumeBuilds = sqliteTable("resume_builds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "Senior Backend Engineer Resume"
  contactInfo: text("contact_info").notNull().default("{}"), // JSON: name, email, phone, linkedin, github, location
  summary: text("summary"), // HTML from rich text editor
  experience: text("experience").notNull().default("[]"), // JSON array of { company, title, location, startDate, endDate, current, description (HTML) }
  education: text("education").notNull().default("[]"), // JSON array of { school, degree, field, startDate, endDate, description }
  skills: text("skills").notNull().default("[]"), // JSON array of { category, items[] }
  projects: text("projects").notNull().default("[]"), // JSON array of { name, url, description (HTML), tech[] }
  certifications: text("certifications").notNull().default("[]"), // JSON array of { name, issuer, date, url }
  customSections: text("custom_sections").notNull().default("[]"), // JSON array of { title, content (HTML) }
  pdfPath: text("pdf_path"), // path to generated PDF
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Interview tracking
export const interviews = sqliteTable("interviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  savedJobId: integer("saved_job_id")
    .notNull()
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "phone_screen", "technical", "behavioral", "system_design", "hiring_manager", "onsite", "final", "other"
  scheduledAt: text("scheduled_at"),
  duration: integer("duration"), // minutes
  interviewerName: text("interviewer_name"),
  interviewerTitle: text("interviewer_title"),
  meetingLink: text("meeting_link"),
  notes: text("notes"),
  prepNotes: text("prep_notes"), // AI-generated prep
  outcome: text("outcome"), // "pending", "passed", "failed", "rescheduled", "cancelled"
  feedback: text("feedback"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const geocodeCache = sqliteTable("geocode_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  locationQuery: text("location_query").notNull().unique(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  displayName: text("display_name"),
  failed: integer("failed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
